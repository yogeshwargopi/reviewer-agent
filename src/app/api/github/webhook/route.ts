import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { webhookDeliveries } from "@/server/db/schema";
import { claimDelivery, handleGitHubEvent } from "@/server/github/events";
import { verifySignature } from "@/server/github/signature";
import { log } from "@/server/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const deliveryId = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");
  const payload = await request.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !deliveryId || !event || !verifySignature(secret, payload, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const action =
    typeof body === "object" && body && "action" in body && typeof body.action === "string" ? body.action : null;
  const claimed = await claimDelivery(deliveryId, event, action);
  if (!claimed) return new Response("ok", { status: 200 });

  try {
    await handleGitHubEvent(event, body);
  } catch (error) {
    await getDb().delete(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
    log.error("webhook.failed", {
      event,
      deliveryId,
      message: error instanceof Error ? error.message.slice(0, 180) : "failed",
    });
    return new Response("retry", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
