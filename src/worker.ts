import { migrateDatabase } from "./server/db/migrate";
import { loadLocalEnv } from "./server/env-file";
import { getBoss } from "./server/jobs/boss";
import { INSTALLATION_CONCURRENCY, REVIEW_QUEUE, REVIEW_RETRY_LIMIT, SYNC_QUEUE } from "./server/jobs/constants";
import { syncInstallationFromGitHub } from "./server/github/sync";
import { log } from "./server/log";
import { processReviewJob } from "./server/review/pipeline";

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  await migrateDatabase();
  const boss = await getBoss();
  await boss.work<{ reviewRunId: string }>(
    REVIEW_QUEUE,
    {
      batchSize: 1,
      localConcurrency: 4,
      groupConcurrency: INSTALLATION_CONCURRENCY,
    },
    async (jobs) => {
      for (const job of jobs) {
        await processReviewJob(job.data.reviewRunId, {
          retryCount: job.retryCount,
          retryLimit: REVIEW_RETRY_LIMIT,
        });
      }
    },
  );
  await boss.work<{ githubInstallationId: number }>(
    SYNC_QUEUE,
    { batchSize: 1, localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        await syncInstallationFromGitHub(job.data.githubInstallationId);
      }
    },
  );
  log.info("worker.started", { installationConcurrency: INSTALLATION_CONCURRENCY });

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}

main().catch((error: unknown) => {
  log.error("worker.crashed", {
    message: error instanceof Error ? error.message : "Worker failed to start",
  });
  process.exit(1);
});
