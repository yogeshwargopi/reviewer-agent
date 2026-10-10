import { createHmac, timingSafeEqual } from "node:crypto";

export function signPayload(secret: string, payload: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifySignature(secret: string, payload: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(secret, payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
