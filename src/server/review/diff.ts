import { minimatch } from "minimatch";
import type { Policy } from "./policy";

export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | null;
  previousFilename?: string;
};

const RISK = [
  /auth/i,
  /session/i,
  /password/i,
  /token/i,
  /secret/i,
  /sql/i,
  /query/i,
  /payment/i,
  /billing/i,
  /crypto/i,
  /permission/i,
  /middleware/i,
  /\/api\//i,
  /webhook/i,
];

export function skipReason(path: string, policy: Policy): string | null {
  const included = policy.includeGlobs.some((glob) => minimatch(path, glob, { dot: true }));
  if (policy.includeGlobs.length > 0 && !included) return "not in include list";
  const excluded = policy.excludeGlobs.find((glob) => minimatch(path, glob, { dot: true }));
  if (excluded && !included) return `matched ${excluded}`;
  return null;
}

export function annotatePatch(patch: string): string {
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
  let newLine = 0;
  let inHunk = false;
  const out: string[] = [];
  for (const raw of patch.split("\n")) {
    const match = raw.match(hunk);
    if (match) {
      inHunk = true;
      newLine = Number(match[1]);
      out.push(raw);
      continue;
    }
    if (!inHunk) {
      out.push(raw);
      continue;
    }
    if (raw.startsWith("-") || raw.startsWith("\\")) {
      out.push(raw);
      continue;
    }
    if (raw.startsWith("+") || raw.startsWith(" ")) {
      out.push(`L${newLine}:${raw}`);
      newLine += 1;
      continue;
    }
    if (raw === "") continue;
    out.push(`L${newLine}:${raw}`);
    newLine += 1;
  }
  return out.join("\n");
}

export function linesFromAnnotated(text: string): Set<number> {
  const lines = new Set<number>();
  for (const row of text.split("\n")) {
    const match = /^L(\d+):/.exec(row);
    if (match) lines.add(Number(match[1]));
  }
  return lines;
}

function riskScore(file: DiffFile): number {
  let score = file.additions + file.deletions * 2;
  if (RISK.some((pattern) => pattern.test(file.filename))) score += 400;
  if (/\.(md|txt|json)$/i.test(file.filename)) score -= 80;
  return score;
}

export type SelectedFile = {
  filename: string;
  status: string;
  annotated: string;
  lines: Set<number>;
  truncated: boolean;
};

export function selectFiles(
  files: DiffFile[],
  policy: Policy,
  options?: { maxChars?: number; maxFiles?: number },
): { included: SelectedFile[]; skipped: { path: string; reason: string }[] } {
  const maxChars = options?.maxChars ?? 80_000;
  const maxFiles = options?.maxFiles ?? 40;
  const skipped: { path: string; reason: string }[] = [];
  const candidates: DiffFile[] = [];

  for (const file of files) {
    const reason = skipReason(file.filename, policy);
    if (reason) {
      skipped.push({ path: file.filename, reason });
      continue;
    }
    if (!file.patch) {
      skipped.push({
        path: file.filename,
        reason: file.status === "removed" ? "deleted file" : "no text diff",
      });
      continue;
    }
    candidates.push(file);
  }

  candidates.sort((a, b) => riskScore(b) - riskScore(a));
  const included: SelectedFile[] = [];
  let used = 0;

  for (const file of candidates) {
    if (included.length >= maxFiles) {
      skipped.push({ path: file.filename, reason: "file budget" });
      continue;
    }
    const annotated = annotatePatch(file.patch ?? "");
    const remaining = maxChars - used;
    if (remaining <= 0) {
      skipped.push({ path: file.filename, reason: "prompt budget" });
      continue;
    }
    const clipped = annotated.length > remaining;
    const text = clipped ? annotated.slice(0, remaining).replace(/\n[^\n]*$/, "") : annotated;
    if (!text.trim()) {
      skipped.push({ path: file.filename, reason: "prompt budget" });
      continue;
    }
    included.push({
      filename: file.filename,
      status: file.status,
      annotated: text,
      lines: linesFromAnnotated(text),
      truncated: clipped,
    });
    used += text.length;
  }

  return { included, skipped };
}
