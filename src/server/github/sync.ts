import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { installations, organizations, policies, repositories } from "../db/schema";
import { log } from "../log";
import { DEFAULT_POLICY } from "../review/policy";
import { getGitHubApp, installationClient } from "./app";

type Account = {
  id: number;
  login: string;
  type: string;
  avatar_url?: string | null;
};

type RepoInput = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
};

export async function upsertInstallation(input: {
  githubInstallationId: number;
  account: Account;
  suspended?: boolean;
  repos?: RepoInput[];
}) {
  const db = getDb();
  const now = new Date();
  const [org] = await db
    .insert(organizations)
    .values({
      githubAccountId: String(input.account.id),
      accountLogin: input.account.login,
      accountType: input.account.type,
      avatarUrl: input.account.avatar_url ?? null,
    })
    .onConflictDoUpdate({
      target: organizations.githubAccountId,
      set: {
        accountLogin: input.account.login,
        accountType: input.account.type,
        avatarUrl: input.account.avatar_url ?? null,
        updatedAt: now,
      },
    })
    .returning();

  if (!org) throw new Error("Organization was not saved");

  await db
    .insert(policies)
    .values({ organizationId: org.id, document: DEFAULT_POLICY })
    .onConflictDoNothing({ target: policies.organizationId });

  const [installation] = await db
    .insert(installations)
    .values({
      githubInstallationId: String(input.githubInstallationId),
      organizationId: org.id,
      accountLogin: input.account.login,
      accountType: input.account.type,
      suspended: input.suspended ?? false,
    })
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: {
        organizationId: org.id,
        accountLogin: input.account.login,
        accountType: input.account.type,
        suspended: input.suspended ?? false,
        updatedAt: now,
      },
    })
    .returning();

  if (!installation) throw new Error("Installation was not saved");

  for (const repo of input.repos ?? []) {
    await upsertRepo(installation.id, org.id, repo);
  }
  return installation;
}

export async function upsertRepo(installationId: string, organizationId: string, repo: RepoInput) {
  const owner = repo.full_name.split("/")[0] ?? "";
  await getDb()
    .insert(repositories)
    .values({
      installationId,
      organizationId,
      githubRepoId: String(repo.id),
      owner,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
    })
    .onConflictDoUpdate({
      target: repositories.githubRepoId,
      set: {
        installationId,
        organizationId,
        owner,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        updatedAt: new Date(),
      },
    });
}

export async function syncInstallationFromGitHub(githubInstallationId: number) {
  const github = getGitHubApp();
  const { data } = await github.octokit.rest.apps.getInstallation({
    installation_id: githubInstallationId,
  });
  const account = data.account;
  if (!account || !("login" in account) || !account.login) {
    throw new Error("Installation account has no login");
  }
  const installation = await upsertInstallation({
    githubInstallationId,
    account: {
      id: account.id,
      login: account.login,
      type: account.type,
      avatar_url: "avatar_url" in account ? account.avatar_url : null,
    },
    suspended: Boolean(data.suspended_at),
  });

  const client = await installationClient(githubInstallationId);
  const repos: RepoInput[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data: listed } = await client.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page,
    });
    for (const repo of listed.repositories) {
      repos.push({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: Boolean(repo.private),
      });
    }
    if (listed.repositories.length < 100) break;
  }

  for (const repo of repos) {
    await upsertRepo(installation.id, installation.organizationId, repo);
  }

  const db = getDb();
  const ids = repos.map((repo) => String(repo.id));
  if (ids.length === 0) {
    await db.delete(repositories).where(eq(repositories.installationId, installation.id));
  } else {
    await db
      .delete(repositories)
      .where(
        and(eq(repositories.installationId, installation.id), notInArray(repositories.githubRepoId, ids)),
      );
  }
  log.info("installation.synced", { githubInstallationId, repoCount: repos.length });
  return installation;
}

export async function setInstallationSuspended(githubInstallationId: number, suspended: boolean) {
  await getDb()
    .update(installations)
    .set({ suspended, updatedAt: new Date() })
    .where(eq(installations.githubInstallationId, String(githubInstallationId)));
}

export async function removeInstallation(githubInstallationId: number) {
  await getDb()
    .delete(installations)
    .where(eq(installations.githubInstallationId, String(githubInstallationId)));
}

export async function removeRepositories(githubInstallationId: number, githubRepoIds: number[]) {
  if (githubRepoIds.length === 0) return;
  const db = getDb();
  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, String(githubInstallationId)))
    .limit(1);
  if (!installation) return;
  await db
    .delete(repositories)
    .where(
      and(
        eq(repositories.installationId, installation.id),
        inArray(
          repositories.githubRepoId,
          githubRepoIds.map((id) => String(id)),
        ),
      ),
    );
}
