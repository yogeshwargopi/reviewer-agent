import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { accessibleInstallations } from "./access";
import { getDb } from "./db/client";
import { findings, installations, orgSecrets, organizations, policies, repositories, reviewRuns } from "./db/schema";

export async function loadWorkspace(userId: string) {
  const installationRows = await accessibleInstallations(userId);
  const installationIds = installationRows.map((row) => row.id);
  if (installationIds.length === 0) {
    return {
      installations: [],
      organizations: [],
      repositories: [],
      reviews: [],
      completedThisWeek: 0,
    };
  }

  const db = getDb();
  const organizationIds = [...new Set(installationRows.map((row) => row.organizationId))];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [organizationRows, repositoryRows, reviewRows, completed] = await Promise.all([
    db.select().from(organizations).where(inArray(organizations.id, organizationIds)),
    db.select().from(repositories).where(inArray(repositories.installationId, installationIds)),
    db
      .select({
        id: reviewRuns.id,
        status: reviewRuns.status,
        pullNumber: reviewRuns.pullNumber,
        prTitle: reviewRuns.prTitle,
        prUrl: reviewRuns.prUrl,
        headSha: reviewRuns.headSha,
        dryRun: reviewRuns.dryRun,
        createdAt: reviewRuns.createdAt,
        startedAt: reviewRuns.startedAt,
        finishedAt: reviewRuns.finishedAt,
        fullName: repositories.fullName,
        modelId: reviewRuns.modelId,
        estimatedCostUsd: reviewRuns.estimatedCostUsd,
        error: reviewRuns.error,
        skipReason: reviewRuns.skipReason,
        summary: reviewRuns.summary,
        reviewEvent: reviewRuns.reviewEvent,
        repositoryId: reviewRuns.repositoryId,
      })
      .from(reviewRuns)
      .innerJoin(repositories, eq(reviewRuns.repositoryId, repositories.id))
      .where(inArray(reviewRuns.installationId, installationIds))
      .orderBy(desc(reviewRuns.createdAt))
      .limit(50),
    db
      .select({ value: count() })
      .from(reviewRuns)
      .where(
        and(
          inArray(reviewRuns.installationId, installationIds),
          eq(reviewRuns.status, "completed"),
          eq(reviewRuns.dryRun, false),
          gte(reviewRuns.createdAt, weekAgo),
        ),
      ),
  ]);

  return {
    installations: installationRows,
    organizations: organizationRows,
    repositories: repositoryRows,
    reviews: reviewRows,
    completedThisWeek: completed[0]?.value ?? 0,
  };
}

export async function loadReview(userId: string, reviewId: string) {
  const installationRows = await accessibleInstallations(userId);
  const allowed = new Set(installationRows.map((row) => row.id));
  const db = getDb();
  const [review] = await db
    .select({
      id: reviewRuns.id,
      status: reviewRuns.status,
      pullNumber: reviewRuns.pullNumber,
      prTitle: reviewRuns.prTitle,
      prUrl: reviewRuns.prUrl,
      headSha: reviewRuns.headSha,
      dryRun: reviewRuns.dryRun,
      createdAt: reviewRuns.createdAt,
      startedAt: reviewRuns.startedAt,
      finishedAt: reviewRuns.finishedAt,
      fullName: repositories.fullName,
      modelId: reviewRuns.modelId,
      estimatedCostUsd: reviewRuns.estimatedCostUsd,
      error: reviewRuns.error,
      skipReason: reviewRuns.skipReason,
      summary: reviewRuns.summary,
      reviewEvent: reviewRuns.reviewEvent,
      repositoryId: reviewRuns.repositoryId,
      installationId: reviewRuns.installationId,
      promptTokens: reviewRuns.promptTokens,
      completionTokens: reviewRuns.completionTokens,
    })
    .from(reviewRuns)
    .innerJoin(repositories, eq(reviewRuns.repositoryId, repositories.id))
    .where(eq(reviewRuns.id, reviewId))
    .limit(1);
  if (!review || !allowed.has(review.installationId)) return null;
  const notes = await db.select().from(findings).where(eq(findings.reviewRunId, reviewId));
  return { review, findings: notes };
}

export async function loadOrganization(userId: string, organizationId: string) {
  const workspace = await loadWorkspace(userId);
  const organization = workspace.organizations.find((item) => item.id === organizationId);
  if (!organization) return null;
  const [policy] = await getDb().select().from(policies).where(eq(policies.organizationId, organizationId)).limit(1);
  const installation = workspace.installations.find((item) => item.organizationId === organizationId);
  return { organization, policy, installation };
}

export async function loadRepository(userId: string, repositoryId: string) {
  const workspace = await loadWorkspace(userId);
  const repository = workspace.repositories.find((item) => item.id === repositoryId);
  if (!repository) return null;
  const organization = workspace.organizations.find((item) => item.id === repository.organizationId);
  const [policy] = await getDb()
    .select()
    .from(policies)
    .where(eq(policies.organizationId, repository.organizationId))
    .limit(1);
  const installation = await getDb()
    .select()
    .from(installations)
    .where(eq(installations.id, repository.installationId))
    .limit(1);
  return { repository, organization, policy, installation: installation[0] ?? null, workspace };
}

export async function savedProviders(organizationIds: string[]) {
  if (organizationIds.length === 0) return [];
  return getDb()
    .select({ organizationId: orgSecrets.organizationId, provider: orgSecrets.provider })
    .from(orgSecrets)
    .where(inArray(orgSecrets.organizationId, organizationIds));
}
