export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) {
    console.warn(JSON.stringify({ level: "warn", event: "migrate.skipped", reason: "DATABASE_URL is not set" }));
    return;
  }
  const { migrateDatabase } = await import("./server/db/migrate");
  await migrateDatabase();
  const webhookUrl = process.env.GITHUB_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    const { startWebhookForwarder } = await import("./server/github/webhook-proxy");
    await startWebhookForwarder(webhookUrl);
  }
}
