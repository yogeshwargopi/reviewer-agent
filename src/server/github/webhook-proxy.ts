import { SmeeClient } from "smee-client";
import { appUrl } from "@/server/env";
import { writeEnvValues } from "@/server/env-file";
import { log } from "@/server/log";

const proxyState = globalThis as typeof globalThis & {
  __reviewerWebhook?: { url: string; client: SmeeClient };
};

export function isPublicWebhookUrl(value: string | undefined): boolean {
  if (!value?.startsWith("https://")) return false;
  try {
    const host = new URL(value).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return false;
  }
}

export async function ensurePublicWebhookUrl() {
  const existing = process.env.GITHUB_WEBHOOK_URL?.trim();
  const url = isPublicWebhookUrl(existing) ? existing! : await SmeeClient.createChannel();
  if (url !== existing) writeEnvValues({ GITHUB_WEBHOOK_URL: url });
  await startWebhookForwarder(url);
  return url;
}

export async function startWebhookForwarder(url: string) {
  if (!url.startsWith("https://smee.io/")) return;
  if (proxyState.__reviewerWebhook?.url === url) return;
  await proxyState.__reviewerWebhook?.client.stop();
  const client = new SmeeClient({
    source: url,
    target: `${appUrl()}/api/github/webhook`,
    logger: console,
  });
  await client.start();
  proxyState.__reviewerWebhook = { url, client };
  log.info("webhook.forwarder_started", { target: `${appUrl()}/api/github/webhook` });
}
