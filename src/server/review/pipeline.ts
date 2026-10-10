import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { findings, installations, orgSecrets, policies, repositories, reviewRuns, suppressions } from "../db/schema";
import { AppError, isRateLimited, isRetryable, safeErrorMessage } from "../errors";
import { decryptSecret } from "../crypto";
import { installationClient } from "../github/app";
import {
  completeCheck,
  fetchPullFiles,
  matchPublishedComments,
  openCheck,
  publishPullRequestReview,
  unresolvedBotCommentKeys,
} from "../github/publish";
import { log } from "../log";
import { estimateCostUsd } from "./cost";
import { selectFiles } from "./diff";
import {
  buildSummary,
  checkConclusion,
  formatComment,
  prepareFindings,
  reviewEvent,
  type PreparedFinding,
} from "./findings";
import { generateReview } from "./model";
import { parseOverrides, parsePolicyDocument, resolvePolicy, type ModelProvider } from "./policy";
import { buildPrompt } from "./prompt";

export async function processReviewJob(
  reviewRunId: string,
  attempt: { retryCount: number; retryLimit: number },
) {
  try {
    await runReview(reviewRunId);
  } catch (error) {
    const terminal = !isRetryable(error) || attempt.retryCount >= attempt.retryLimit;
    await recordFailure(reviewRunId, error, terminal);
    if (!terminal) throw error;
  }
}

async function recordFailure(reviewRunId: string, error: unknown, terminal: boolean) {
  const message = safeErrorMessage(error);
  log.error("review.attempt_failed", { reviewRunId, message, terminal });
  await getDb()
    .update(reviewRuns)
    .set({
      status: terminal ? (isRateLimited(error) ? "rate_limited" : "failed") : "queued",
      error: message,
      finishedAt: terminal ? new Date() : null,
    })
    .where(eq(reviewRuns.id, reviewRunId));
}

async function runReview(reviewRunId: string) {
  const db = getDb();
  const [run] = await db.select().from(reviewRuns).where(eq(reviewRuns.id, reviewRunId)).limit(1);
  if (!run) return;
  if (run.status === "completed" || run.status === "skipped") return;

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, run.repositoryId)).limit(1);
  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.id, run.installationId))
    .limit(1);
  if (!repo || !installation) {
    throw new AppError("The repository is no longer connected.", false);
  }

  const [policyRow] = await db
    .select()
    .from(policies)
    .where(eq(policies.organizationId, repo.organizationId))
    .limit(1);
  const policy = resolvePolicy(
    parsePolicyDocument(policyRow?.document),
    repo.policyMode,
    parseOverrides(repo.overrides),
  );

  await db
    .update(reviewRuns)
    .set({
      status: "running",
      startedAt: run.startedAt ?? new Date(),
      error: null,
      policySnapshot: policy,
      modelProvider: policy.modelProvider,
      modelId: policy.modelId,
    })
    .where(eq(reviewRuns.id, run.id));

  const githubInstallationId = Number(installation.githubInstallationId);
  const client = await installationClient(githubInstallationId);

  let checkRunId = run.checkRunId ? Number(run.checkRunId) : null;
  if (!run.dryRun && !checkRunId) {
    checkRunId = await openCheck(client, repo.owner, repo.name, run.headSha);
    await db
      .update(reviewRuns)
      .set({ checkRunId: String(checkRunId) })
      .where(eq(reviewRuns.id, run.id));
  }

  if (!run.dryRun && run.githubReviewId) {
    if (checkRunId) {
      await completeCheck({
        client,
        owner: repo.owner,
        repo: repo.name,
        checkRunId,
        conclusion: run.reviewEvent === "REQUEST_CHANGES" ? "failure" : run.summary ? "neutral" : "success",
        title: "Review already published",
        summary: run.summary ?? "The review was published on a previous attempt.",
      });
    }
    await db
      .update(reviewRuns)
      .set({ status: "completed", finishedAt: new Date(), error: null })
      .where(eq(reviewRuns.id, run.id));
    return;
  }

  const files = await fetchPullFiles(client, repo.owner, repo.name, run.pullNumber);
  const selected = selectFiles(files, policy);
  if (selected.included.length === 0) {
    const reason = "No reviewable files in this diff";
    if (!run.dryRun && checkRunId) {
      await completeCheck({
        client,
        owner: repo.owner,
        repo: repo.name,
        checkRunId,
        conclusion: "skipped",
        title: "Review skipped",
        summary: reason,
      });
    }
    await db
      .update(reviewRuns)
      .set({ status: "skipped", skipReason: reason, summary: reason, finishedAt: new Date() })
      .where(eq(reviewRuns.id, run.id));
    log.info("review.skipped", { reviewRunId, reason });
    return;
  }

  const suppressionRows = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.repositoryId, repo.id));
  const prior = await db
    .select({ signature: findings.signature })
    .from(findings)
    .innerJoin(reviewRuns, eq(findings.reviewRunId, reviewRuns.id))
    .where(
      and(
        eq(reviewRuns.repositoryId, repo.id),
        eq(reviewRuns.pullNumber, run.pullNumber),
        eq(reviewRuns.dryRun, false),
        eq(reviewRuns.status, "completed"),
      ),
    );
  const commentKeys = run.dryRun
    ? new Set<string>()
    : await unresolvedBotCommentKeys(client, repo.owner, repo.name, run.pullNumber);

  const apiKey = await apiKeyFor(repo.organizationId, policy.modelProvider);
  const generated = await generateReview(policy, apiKey, buildPrompt(policy, selected.included));
  const prepared = prepareFindings({
    raw: generated.findings,
    validLines: new Map(selected.included.map((file) => [file.filename, file.lines])),
    policy,
    suppressions: suppressionRows.map((row) => ({
      signature: row.signature,
      path: row.path,
      line: row.line,
    })),
    existingSignatures: new Set(prior.map((row) => row.signature)),
    existingCommentKeys: commentKeys,
  });
  const summary = buildSummary({
    modelSummary: generated.summary,
    findings: prepared.accepted,
    reviewed: selected.included.map((file) => file.filename),
    skipped: selected.skipped,
    heldBack: prepared.heldBack,
  });
  const event = reviewEvent(policy, prepared.accepted);
  const cost = estimateCostUsd(policy.modelId, generated.inputTokens, generated.outputTokens);

  if (run.dryRun) {
    await replaceFindings(run.id, prepared.accepted, new Map());
    await db
      .update(reviewRuns)
      .set({
        status: "completed",
        summary,
        reviewEvent: event,
        promptTokens: generated.inputTokens,
        completionTokens: generated.outputTokens,
        estimatedCostUsd: cost,
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(reviewRuns.id, run.id));
    log.info("review.dry_run_completed", {
      reviewRunId,
      findingCount: prepared.accepted.length,
    });
    return;
  }

  const published = await publishPullRequestReview({
    client,
    owner: repo.owner,
    repo: repo.name,
    pullNumber: run.pullNumber,
    headSha: run.headSha,
    event,
    body: summary,
    comments: prepared.accepted.map((finding) => ({
      path: finding.path,
      line: finding.line,
      body: formatComment(finding),
    })),
  });
  const commentIds = published.droppedInline
    ? new Map<string, string>()
    : await matchPublishedComments({
        client,
        owner: repo.owner,
        repo: repo.name,
        pullNumber: run.pullNumber,
        headSha: run.headSha,
      });
  await replaceFindings(run.id, prepared.accepted, commentIds);
  const conclusion = checkConclusion(event, prepared.accepted.length);
  if (checkRunId) {
    await completeCheck({
      client,
      owner: repo.owner,
      repo: repo.name,
      checkRunId,
      conclusion,
      title: conclusion === "failure" ? "Changes requested" : prepared.accepted.length ? "Comments left" : "No issues found",
      summary,
      findings: prepared.accepted,
    });
  }
  await db
    .update(reviewRuns)
    .set({
      status: "completed",
      summary,
      reviewEvent: event,
      githubReviewId: String(published.reviewId),
      promptTokens: generated.inputTokens,
      completionTokens: generated.outputTokens,
      estimatedCostUsd: cost,
      finishedAt: new Date(),
      error: null,
    })
    .where(eq(reviewRuns.id, run.id));
  log.info("review.completed", {
    reviewRunId,
    repository: repo.fullName,
    pullNumber: run.pullNumber,
    findingCount: prepared.accepted.length,
    conclusion,
  });
}

async function replaceFindings(
  reviewRunId: string,
  accepted: PreparedFinding[],
  commentIds: Map<string, string>,
) {
  const db = getDb();
  await db.delete(findings).where(eq(findings.reviewRunId, reviewRunId));
  if (accepted.length === 0) return;
  await db.insert(findings).values(
    accepted.map((finding) => ({
      reviewRunId,
      path: finding.path,
      line: finding.line,
      side: "RIGHT",
      severity: finding.severity,
      category: finding.category,
      confidence: finding.confidence,
      title: finding.title,
      body: finding.body,
      suggestion: finding.suggestion || null,
      signature: finding.signature,
      githubCommentId: commentIds.get(`${finding.path}:${finding.line}`) ?? null,
    })),
  );
}

async function apiKeyFor(organizationId: string, provider: ModelProvider) {
  const [row] = await getDb()
    .select()
    .from(orgSecrets)
    .where(and(eq(orgSecrets.organizationId, organizationId), eq(orgSecrets.provider, provider)))
    .limit(1);
  if (row) {
    return decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
  }
  const envKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!envKey) {
    throw new AppError(`No ${provider} API key is saved for this organization.`, false, "missing_api_key");
  }
  return envKey;
}
