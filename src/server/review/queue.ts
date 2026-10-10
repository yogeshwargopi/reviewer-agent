import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { reviewRuns } from "../db/schema";
import { enqueueReview } from "../jobs/boss";
import { log } from "../log";

export async function queueReview(input: {
  repositoryId: string;
  installationId: string;
  pullNumber: number;
  headSha: string;
  baseSha: string | null;
  prTitle: string | null;
  prUrl: string | null;
  dryRun?: boolean;
  skipReason?: string;
}) {
  const db = getDb();
  const dryRun = input.dryRun ?? false;

  if (input.skipReason && !dryRun) {
    await db
      .insert(reviewRuns)
      .values({
        repositoryId: input.repositoryId,
        installationId: input.installationId,
        pullNumber: input.pullNumber,
        headSha: input.headSha,
        baseSha: input.baseSha,
        prTitle: input.prTitle,
        prUrl: input.prUrl,
        status: "skipped",
        skipReason: input.skipReason,
        dryRun: false,
        finishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [reviewRuns.repositoryId, reviewRuns.pullNumber, reviewRuns.headSha],
        where: eq(reviewRuns.dryRun, false),
      });
    return null;
  }

  if (!dryRun) {
    const [existing] = await db
      .select()
      .from(reviewRuns)
      .where(
        and(
          eq(reviewRuns.repositoryId, input.repositoryId),
          eq(reviewRuns.pullNumber, input.pullNumber),
          eq(reviewRuns.headSha, input.headSha),
          eq(reviewRuns.dryRun, false),
        ),
      )
      .limit(1);
    if (existing) {
      const canRetry =
        existing.status === "failed" ||
        existing.status === "rate_limited" ||
        existing.status === "skipped";
      if (canRetry) {
        await db
          .update(reviewRuns)
          .set({ status: "queued", error: null, skipReason: null, finishedAt: null })
          .where(eq(reviewRuns.id, existing.id));
        await enqueueReview({
          reviewRunId: existing.id,
          installationId: input.installationId,
          singletonKey: liveKey(input),
        });
        log.info("review.requeued", { reviewRunId: existing.id });
        return { ...existing, status: "queued" as const };
      }
      return existing;
    }
  }

  const [created] = await db
    .insert(reviewRuns)
    .values({
      repositoryId: input.repositoryId,
      installationId: input.installationId,
      pullNumber: input.pullNumber,
      headSha: input.headSha,
      baseSha: input.baseSha,
      prTitle: input.prTitle,
      prUrl: input.prUrl,
      status: "queued",
      dryRun,
    })
    .returning();
  if (!created) throw new Error("Review run was not created");

  await enqueueReview({
    reviewRunId: created.id,
    installationId: input.installationId,
    singletonKey: dryRun ? `dry:${created.id}` : liveKey(input),
  });
  log.info("review.queued", { reviewRunId: created.id, dryRun, pullNumber: input.pullNumber });
  return created;
}

function liveKey(input: { repositoryId: string; pullNumber: number; headSha: string }) {
  return `${input.repositoryId}:${input.pullNumber}:${input.headSha}`;
}
