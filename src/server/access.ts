import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { accounts, installationAccess, installations, users } from "./db/schema";
import { log } from "./log";

export async function grantInstallationAccess(userId: string, installationId: string) {
  await getDb()
    .insert(installationAccess)
    .values({ userId, installationId })
    .onConflictDoNothing();
}

export async function accessibleInstallations(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "github")))
    .limit(1);

  const githubIds = new Set<number>();
  if (account?.access_token) {
    try {
      const response = await fetch("https://api.github.com/user/installations?per_page=100", {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "reviewer-agent",
        },
        cache: "no-store",
      });
      if (response.ok) {
        const body = (await response.json()) as { installations?: Array<{ id: number }> };
        for (const installation of body.installations ?? []) githubIds.add(installation.id);
      }
    } catch (error) {
      log.warn("access.installations_unavailable", {
        message: error instanceof Error ? error.message.slice(0, 120) : "failed",
      });
    }
  }

  const rows = await db.select().from(installations);
  for (const row of rows) {
    const matchesLogin = Boolean(user?.githubLogin && row.accountLogin === user.githubLogin);
    const matchesApi = githubIds.has(Number(row.githubInstallationId));
    if (matchesLogin || matchesApi) await grantInstallationAccess(userId, row.id);
  }

  const grants = await db
    .select({ installationId: installationAccess.installationId })
    .from(installationAccess)
    .where(eq(installationAccess.userId, userId));
  const allowed = new Set(grants.map((grant) => grant.installationId));
  return rows.filter((row) => allowed.has(row.id));
}

export async function userCanAccessInstallation(userId: string, installationId: string) {
  const [grant] = await getDb()
    .select({ installationId: installationAccess.installationId })
    .from(installationAccess)
    .where(and(eq(installationAccess.userId, userId), eq(installationAccess.installationId, installationId)))
    .limit(1);
  if (grant) return true;
  const rows = await accessibleInstallations(userId);
  return rows.some((row) => row.id === installationId);
}
