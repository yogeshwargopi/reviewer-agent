import { PgBoss, type Queue } from "pg-boss";
import { log } from "../log";
import { INSTALLATION_CONCURRENCY, REVIEW_QUEUE, REVIEW_RETRY_LIMIT, SYNC_QUEUE } from "./constants";

type QueueOptions = Omit<Queue, "name">;

let bossPromise: Promise<PgBoss> | null = null;

async function ensureQueue(boss: PgBoss, name: string, options: QueueOptions) {
  const existing = await boss.getQueue(name);
  if (existing) return;
  try {
    await boss.createQueue(name, options);
  } catch (error) {
    const again = await boss.getQueue(name);
    if (!again) throw error;
  }
}

async function startBoss() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss(url);
  boss.on("error", (error) => {
    log.error("queue.error", { message: error.message });
  });
  await boss.start();
  await ensureQueue(boss, REVIEW_QUEUE, {
    retryLimit: REVIEW_RETRY_LIMIT,
    retryDelay: 20,
    retryBackoff: true,
    retryDelayMax: 300,
    expireInSeconds: 900,
  });
  await ensureQueue(boss, SYNC_QUEUE, {
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 300,
  });
  return boss;
}

export function getBoss() {
  if (!bossPromise) {
    bossPromise = startBoss().catch((error) => {
      bossPromise = null;
      throw error;
    });
  }
  return bossPromise;
}

export async function enqueueReview(input: {
  reviewRunId: string;
  installationId: string;
  singletonKey: string;
}) {
  const boss = await getBoss();
  return boss.send(
    REVIEW_QUEUE,
    { reviewRunId: input.reviewRunId },
    {
      singletonKey: input.singletonKey,
      group: { id: input.installationId },
      retryLimit: REVIEW_RETRY_LIMIT,
      retryDelay: 20,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: 900,
    },
  );
}

export async function enqueueSync(githubInstallationId: number) {
  const boss = await getBoss();
  return boss.send(
    SYNC_QUEUE,
    { githubInstallationId },
    {
      singletonKey: `install:${githubInstallationId}`,
      retryLimit: 3,
      retryDelay: 15,
      retryBackoff: true,
    },
  );
}

export { INSTALLATION_CONCURRENCY };
