import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { installations, policies, repositories, suppressions, webhookDeliveries } from "../db/schema";
import { log } from "../log";
import { parseCommand, parseIgnoreTarget } from "../review/commands";
import { decideReview, parseOverrides, parsePolicyDocument, resolvePolicy } from "../review/policy";
import { queueReview } from "../review/queue";
import { installationClient } from "./app";
import { createSkippedCheck, replyOnPullRequest } from "./publish";
import { enqueueSync } from "../jobs/boss";
import {
  removeInstallation,
  removeRepositories,
  setInstallationSuspended,
  upsertInstallation,
  upsertRepo,
} from "./sync";

export async function claimDelivery(deliveryId: string, event: string, action: string | null) {
  const rows = await getDb()
    .insert(webhookDeliveries)
    .values({ id: deliveryId, event, action })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });
  return rows.length > 0;
}

export async function handleGitHubEvent(event: string, payload: unknown) {
  if (!isRecord(payload)) return;
  const action = typeof payload.action === "string" ? payload.action : null;
  if (event === "installation") await handleInstallation(action, payload);
  else if (event === "installation_repositories") await handleInstallationRepositories(action, payload);
  else if (event === "pull_request") await handlePullRequest(action, payload);
  else if (event === "issue_comment") await handleIssueComment(action, payload);
}

async function handleInstallation(action: string | null, payload: Record<string, unknown>) {
  const installation = asRecord(payload.installation);
  const account = asRecord(installation?.account);
  const installationId = numberValue(installation?.id);
  if (!installation || !account || installationId == null || typeof account.login !== "string") return;
  const accountId = numberValue(account.id);
  if (accountId == null) return;

  if (action === "deleted") {
    await removeInstallation(installationId);
    log.info("installation.deleted", { githubInstallationId: installationId });
    return;
  }
  if (action === "suspend" || action === "unsuspend") {
    await setInstallationSuspended(installationId, action === "suspend");
    return;
  }

  const repos = Array.isArray(payload.repositories) ? payload.repositories.flatMap(readRepo) : [];
  await upsertInstallation({
    githubInstallationId: installationId,
    account: {
      id: accountId,
      login: account.login,
      type: typeof account.type === "string" ? account.type : "Organization",
      avatar_url: typeof account.avatar_url === "string" ? account.avatar_url : null,
    },
    suspended: Boolean(installation.suspended_at),
    repos,
  });
  await enqueueSync(installationId);
}

async function handleInstallationRepositories(action: string | null, payload: Record<string, unknown>) {
  const installation = asRecord(payload.installation);
  const installationId = numberValue(installation?.id);
  const account = asRecord(installation?.account);
  if (installationId == null) return;
  if (action === "removed") {
    const removed = Array.isArray(payload.repositories_removed)
      ? payload.repositories_removed.flatMap(readRepo)
      : [];
    await removeRepositories(
      installationId,
      removed.map((repo) => repo.id),
    );
    return;
  }
  const accountId = numberValue(account?.id);
  if (account && accountId != null && typeof account.login === "string") {
    await upsertInstallation({
      githubInstallationId: installationId,
      account: {
        id: accountId,
        login: account.login,
        type: typeof account.type === "string" ? account.type : "Organization",
        avatar_url: typeof account.avatar_url === "string" ? account.avatar_url : null,
      },
    });
  }
  const added = Array.isArray(payload.repositories_added) ? payload.repositories_added.flatMap(readRepo) : [];
  const db = getDb();
  const [row] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, String(installationId)))
    .limit(1);
  if (!row) {
    await enqueueSync(installationId);
    return;
  }
  for (const repo of added) await upsertRepo(row.id, row.organizationId, repo);
}

async function handlePullRequest(action: string | null, payload: Record<string, unknown>) {
  const pull = asRecord(payload.pull_request);
  const repository = asRecord(payload.repository);
  const installation = asRecord(payload.installation);
  if (!pull || !repository || !action) return;
  const repo = await ensureRepository(repository, numberValue(installation?.id));
  if (!repo) return;

  const head = asRecord(pull.head);
  const base = asRecord(pull.base);
  const headSha = typeof head?.sha === "string" ? head.sha : null;
  const pullNumber = numberValue(pull.number);
  if (!headSha || pullNumber == null) return;
  const labels = Array.isArray(pull.labels)
    ? pull.labels.flatMap((label) => {
        const record = asRecord(label);
        return typeof record?.name === "string" ? [record.name] : [];
      })
    : [];

  const policy = await policyForRepository(repo.organizationId, repo.policyMode, repo.overrides);
  const decision = decideReview({
    action,
    draft: pull.draft === true,
    enabled: repo.enabled,
    suspended: repo.suspended,
    labels,
    triggers: policy.triggers,
    force: false,
  });
  if (decision.action === "ignore") return;

  const shared = {
    repositoryId: repo.id,
    installationId: repo.installationId,
    pullNumber,
    headSha,
    baseSha: typeof base?.sha === "string" ? base.sha : null,
    prTitle: typeof pull.title === "string" ? pull.title : null,
    prUrl: typeof pull.html_url === "string" ? pull.html_url : null,
  };

  if (decision.action === "skip") {
    await queueReview({ ...shared, skipReason: decision.reason });
    if (labels.some((label) => label.toLowerCase() === "skip-review")) {
      try {
        const client = await installationClient(Number(repo.githubInstallationId));
        await createSkippedCheck({
          client,
          owner: repo.owner,
          repo: repo.name,
          headSha,
          reason: decision.reason,
        });
      } catch (error) {
        log.warn("review.skip_check_failed", {
          repository: repo.fullName,
          message: error instanceof Error ? error.message.slice(0, 160) : "failed",
        });
      }
    }
    return;
  }

  await queueReview(shared);
}

async function handleIssueComment(action: string | null, payload: Record<string, unknown>) {
  if (action !== "created") return;
  const issue = asRecord(payload.issue);
  const comment = asRecord(payload.comment);
  const repository = asRecord(payload.repository);
  const installation = asRecord(payload.installation);
  if (!issue?.pull_request || !comment || !repository) return;
  const command = parseCommand(typeof comment.body === "string" ? comment.body : "");
  if (!command) return;
  const repo = await ensureRepository(repository, numberValue(installation?.id));
  if (!repo || repo.suspended) return;
  const pullNumber = numberValue(issue.number);
  if (pullNumber == null) return;
  const client = await installationClient(Number(repo.githubInstallationId));

  if (command.type === "ignore") {
    if (!command.target) {
      await replyOnPullRequest(
        client,
        repo.owner,
        repo.name,
        pullNumber,
        "Name the note to suppress: `@reviewer-agent ignore path/to/file.ts:42`.",
      );
      return;
    }
    const target = parseIgnoreTarget(command.target);
    await getDb().insert(suppressions).values({
      repositoryId: repo.id,
      signature: target.signature ?? null,
      path: target.path ?? null,
      line: target.line ?? null,
    });
    await replyOnPullRequest(
      client,
      repo.owner,
      repo.name,
      pullNumber,
      `Suppressed future notes for \`${command.target}\`.`,
    );
    log.info("review.suppressed", { repository: repo.fullName, pullNumber });
    return;
  }

  const { data: pull } = await client.rest.pulls.get({
    owner: repo.owner,
    repo: repo.name,
    pull_number: pullNumber,
  });
  const queued = await queueReview({
    repositoryId: repo.id,
    installationId: repo.installationId,
    pullNumber,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    prTitle: pull.title,
    prUrl: pull.html_url,
  });
  if (queued && (queued.status === "completed" || queued.status === "skipped")) {
    await replyOnPullRequest(
      client,
      repo.owner,
      repo.name,
      pullNumber,
      `This commit \`${pull.head.sha.slice(0, 7)}\` was already reviewed.`,
    );
  }
}

async function ensureRepository(repository: Record<string, unknown>, githubInstallationId: number | null) {
  const githubRepoId = numberValue(repository.id);
  const fullName = typeof repository.full_name === "string" ? repository.full_name : null;
  if (githubRepoId == null || !fullName || githubInstallationId == null) return null;
  const db = getDb();
  const [existing] = await db
    .select({
      id: repositories.id,
      installationId: repositories.installationId,
      organizationId: repositories.organizationId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      enabled: repositories.enabled,
      policyMode: repositories.policyMode,
      overrides: repositories.overrides,
      githubInstallationId: installations.githubInstallationId,
      suspended: installations.suspended,
    })
    .from(repositories)
    .innerJoin(installations, eq(repositories.installationId, installations.id))
    .where(eq(repositories.githubRepoId, String(githubRepoId)))
    .limit(1);
  if (existing) return existing;

  const ownerRecord = asRecord(repository.owner);
  const ownerLogin = typeof ownerRecord?.login === "string" ? ownerRecord.login : fullName.split("/")[0];
  const ownerId = numberValue(ownerRecord?.id) ?? 0;
  await upsertInstallation({
    githubInstallationId,
    account: {
      id: ownerId,
      login: ownerLogin ?? fullName,
      type: typeof ownerRecord?.type === "string" ? ownerRecord.type : "Organization",
    },
    repos: readRepo(repository),
  });
  await enqueueSync(githubInstallationId);
  const [created] = await db
    .select({
      id: repositories.id,
      installationId: repositories.installationId,
      organizationId: repositories.organizationId,
      owner: repositories.owner,
      name: repositories.name,
      fullName: repositories.fullName,
      enabled: repositories.enabled,
      policyMode: repositories.policyMode,
      overrides: repositories.overrides,
      githubInstallationId: installations.githubInstallationId,
      suspended: installations.suspended,
    })
    .from(repositories)
    .innerJoin(installations, eq(repositories.installationId, installations.id))
    .where(eq(repositories.githubRepoId, String(githubRepoId)))
    .limit(1);
  return created ?? null;
}

async function policyForRepository(
  organizationId: string,
  mode: "inherit" | "override",
  overrides: unknown,
) {
  const [row] = await getDb().select().from(policies).where(eq(policies.organizationId, organizationId)).limit(1);
  return resolvePolicy(parsePolicyDocument(row?.document), mode, parseOverrides(overrides));
}

function readRepo(value: unknown) {
  const repo = asRecord(value);
  const id = numberValue(repo?.id);
  const name = typeof repo?.name === "string" ? repo.name : null;
  const fullName = typeof repo?.full_name === "string" ? repo.full_name : null;
  if (id == null || !name || !fullName) return [];
  return [{ id, name, full_name: fullName, private: repo?.private === true }];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
