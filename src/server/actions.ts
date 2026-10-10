"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { userCanAccessInstallation } from "./access";
import { auth, signOut } from "./auth";
import { encryptSecret } from "./crypto";
import { getDb } from "./db/client";
import { installations, orgSecrets, organizations, policies, repositories } from "./db/schema";
import { installationClient } from "./github/app";
import { latestOpenPull } from "./github/publish";
import { log } from "./log";
import { policyFromForm } from "./review/policy";
import { queueReview } from "./review/queue";

async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  return session.user;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function toggleRepository(formData: FormData) {
  const user = await requireUser();
  const repoId = String(formData.get("repositoryId") ?? "");
  const enabled = formData.get("enabled") === "true";
  const repo = await repositoryForUser(user.id, repoId);
  if (!repo) redirect("/overview");
  await getDb()
    .update(repositories)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(repositories.id, repo.id));
  redirect("/overview");
}

export async function saveOrganizationPolicy(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!(await userCanAccessOrganization(user.id, organizationId))) redirect("/policies");
  const document = policyFromForm(formData);
  const db = getDb();
  const updated = await db
    .update(policies)
    .set({ document, updatedAt: new Date() })
    .where(eq(policies.organizationId, organizationId))
    .returning({ id: policies.id });
  if (updated.length === 0) {
    await db.insert(policies).values({ organizationId, document });
  }
  redirect(`/policies/${organizationId}?saved=1`);
}

export async function saveRepositoryOverride(formData: FormData) {
  const user = await requireUser();
  const repoId = String(formData.get("repositoryId") ?? "");
  const repo = await repositoryForUser(user.id, repoId);
  if (!repo) redirect("/overview");
  const document = policyFromForm(formData);
  await getDb()
    .update(repositories)
    .set({ policyMode: "override", overrides: document, updatedAt: new Date() })
    .where(eq(repositories.id, repo.id));
  redirect(`/repos/${repo.id}?saved=1`);
}

export async function useOrganizationDefault(formData: FormData) {
  const user = await requireUser();
  const repoId = String(formData.get("repositoryId") ?? "");
  const repo = await repositoryForUser(user.id, repoId);
  if (!repo) redirect("/overview");
  await getDb()
    .update(repositories)
    .set({ policyMode: "inherit", overrides: null, updatedAt: new Date() })
    .where(eq(repositories.id, repo.id));
  redirect(`/repos/${repo.id}?saved=1`);
}

export async function customizeRepository(formData: FormData) {
  const user = await requireUser();
  const repoId = String(formData.get("repositoryId") ?? "");
  const repo = await repositoryForUser(user.id, repoId);
  if (!repo) redirect("/overview");
  const [policy] = await getDb()
    .select()
    .from(policies)
    .where(eq(policies.organizationId, repo.organizationId))
    .limit(1);
  await getDb()
    .update(repositories)
    .set({
      policyMode: "override",
      overrides: policy?.document ?? null,
      updatedAt: new Date(),
    })
    .where(eq(repositories.id, repo.id));
  redirect(`/repos/${repo.id}`);
}

export async function saveProviderKey(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (provider !== "openai" && provider !== "anthropic") redirect("/settings");
  if (!(await userCanAccessOrganization(user.id, organizationId))) redirect("/settings");
  if (!apiKey) redirect(`/settings?notice=empty`);
  const secret = encryptSecret(apiKey);
  const db = getDb();
  await db
    .insert(orgSecrets)
    .values({
      organizationId,
      provider,
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      tag: secret.tag,
    })
    .onConflictDoUpdate({
      target: [orgSecrets.organizationId, orgSecrets.provider],
      set: {
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        tag: secret.tag,
        updatedAt: new Date(),
      },
    });
  log.info("secret.saved", { organizationId, provider });
  redirect("/settings?saved=1");
}

export async function deleteProviderKey(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!(await userCanAccessOrganization(user.id, organizationId))) redirect("/settings");
  await getDb()
    .delete(orgSecrets)
    .where(and(eq(orgSecrets.organizationId, organizationId), eq(orgSecrets.provider, provider)));
  redirect("/settings?saved=1");
}

export async function startDryRun(formData: FormData) {
  const user = await requireUser();
  const repoId = String(formData.get("repositoryId") ?? "");
  const repo = await repositoryForUser(user.id, repoId);
  if (!repo) redirect("/overview");
  let reviewId: string | null = null;
  let notice = "dry-run-failed";
  try {
    const client = await installationClient(Number(repo.githubInstallationId));
    const pull = await latestOpenPull(client, repo.owner, repo.name);
    if (!pull) {
      notice = "no-pr";
    } else {
      const run = await queueReview({
        repositoryId: repo.id,
        installationId: repo.installationId,
        pullNumber: pull.number,
        headSha: pull.head.sha,
        baseSha: pull.base.sha,
        prTitle: pull.title,
        prUrl: pull.html_url,
        dryRun: true,
      });
      reviewId = run?.id ?? null;
    }
  } catch {
    notice = "dry-run-failed";
  }
  if (reviewId) redirect(`/reviews/${reviewId}`);
  redirect(`/repos/${repo.id}?notice=${notice}`);
}

async function repositoryForUser(userId: string, repositoryId: string) {
  const [repo] = await getDb()
    .select({
      id: repositories.id,
      installationId: repositories.installationId,
      organizationId: repositories.organizationId,
      owner: repositories.owner,
      name: repositories.name,
      githubInstallationId: installations.githubInstallationId,
    })
    .from(repositories)
    .innerJoin(installations, eq(repositories.installationId, installations.id))
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  if (!repo) return null;
  if (!(await userCanAccessInstallation(userId, repo.installationId))) return null;
  return repo;
}

async function userCanAccessOrganization(userId: string, organizationId: string) {
  const [org] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return false;
  const rows = await getDb()
    .select({ id: installations.id })
    .from(installations)
    .where(eq(installations.organizationId, organizationId));
  for (const row of rows) {
    if (await userCanAccessInstallation(userId, row.id)) return true;
  }
  return false;
}
