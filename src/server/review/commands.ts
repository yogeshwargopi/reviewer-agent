import { PRODUCT_HANDLE } from "@/lib/brand";

export type ReviewCommand =
  | { type: "review" }
  | { type: "ignore"; target: string | null };

const handle = PRODUCT_HANDLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseCommand(body: string | null | undefined): ReviewCommand | null {
  if (!body) return null;
  const ignore = body.match(new RegExp(`(?:^|\\s)@${handle}\\s+ignore\\b(?:\\s+(\\S+))?`, "i"));
  if (ignore) return { type: "ignore", target: ignore[1] ?? null };
  if (new RegExp(`(?:^|\\s)@${handle}\\s+review\\b`, "i").test(body)) return { type: "review" };
  return null;
}

export function parseIgnoreTarget(target: string): { signature?: string; path?: string; line?: number } {
  if (target.includes("|")) return { signature: target };
  const lineMatch = /^(.*):(\d+)$/.exec(target);
  if (lineMatch?.[1]) return { path: lineMatch[1], line: Number(lineMatch[2]) };
  return { path: target };
}
