import {
  CATEGORY_LABELS,
  SEVERITY_RANK,
  type Category,
  type FindingDraft,
  type Policy,
  type Severity,
} from "./policy";

export type Suppression = {
  signature: string | null;
  path: string | null;
  line: number | null;
};

export type PreparedFinding = FindingDraft & { signature: string };

export function findingSignature(finding: Pick<FindingDraft, "path" | "title" | "category">): string {
  const title = finding.title.toLowerCase().replace(/\s+/g, " ").trim();
  return `${finding.category}|${finding.path}|${title}`;
}

export function meetsSeverity(severity: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

export function isSuppressed(finding: FindingDraft, signature: string, suppressions: Suppression[]): boolean {
  return suppressions.some((item) => {
    if (item.signature && item.signature === signature) return true;
    if (item.path && item.path === finding.path && (item.line == null || item.line === finding.line)) {
      return true;
    }
    return false;
  });
}

export function prepareFindings(input: {
  raw: FindingDraft[];
  validLines: Map<string, Set<number>>;
  policy: Policy;
  suppressions: Suppression[];
  existingSignatures: Set<string>;
  existingCommentKeys: Set<string>;
}): { accepted: PreparedFinding[]; heldBack: number; dropped: Record<string, number> } {
  const dropped: Record<string, number> = {};
  const bump = (reason: string) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  const best = new Map<string, PreparedFinding>();

  for (const finding of input.raw) {
    const lines = input.validLines.get(finding.path);
    if (!lines || !lines.has(finding.line)) {
      bump("outside diff");
      continue;
    }
    if (!input.policy.focus[finding.category]) {
      bump("focus disabled");
      continue;
    }
    if (!meetsSeverity(finding.severity, input.policy.minSeverity)) {
      bump("below severity");
      continue;
    }
    if (finding.confidence < input.policy.confidenceFloor) {
      bump("below confidence");
      continue;
    }
    const signature = findingSignature(finding);
    if (input.existingSignatures.has(signature)) {
      bump("already reported");
      continue;
    }
    if (input.existingCommentKeys.has(`${finding.path}:${finding.line}`)) {
      bump("existing comment");
      continue;
    }
    if (isSuppressed(finding, signature, input.suppressions)) {
      bump("suppressed");
      continue;
    }
    const key = `${finding.path}:${finding.line}`;
    const next = { ...finding, signature };
    const current = best.get(key);
    if (!current || SEVERITY_RANK[next.severity] > SEVERITY_RANK[current.severity]) {
      best.set(key, next);
    }
  }

  const ranked = [...best.values()].sort((a, b) => {
    const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severity !== 0) return severity;
    return b.confidence - a.confidence;
  });
  const accepted = ranked.slice(0, input.policy.maxComments);
  return { accepted, heldBack: Math.max(0, ranked.length - accepted.length), dropped };
}

export function reviewEvent(policy: Policy, findings: PreparedFinding[]): "COMMENT" | "REQUEST_CHANGES" {
  const hasBlocker = findings.some((finding) => finding.severity === "blocker");
  if (policy.blockingMode === "request_changes" && hasBlocker) return "REQUEST_CHANGES";
  return "COMMENT";
}

export function checkConclusion(
  event: "COMMENT" | "REQUEST_CHANGES",
  findingCount: number,
): "success" | "failure" | "neutral" {
  if (event === "REQUEST_CHANGES") return "failure";
  if (findingCount === 0) return "success";
  return "neutral";
}

export function formatComment(finding: PreparedFinding): string {
  const severity = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
  const suggestion = finding.suggestion.trim();
  return [
    `**${severity} · ${CATEGORY_LABELS[finding.category]}** — ${finding.title.trim()}`,
    "",
    finding.body.trim(),
    suggestion ? "" : null,
    suggestion ? `Prefer: ${suggestion}` : null,
    "",
    `<!-- reviewer-agent:${finding.signature} -->`,
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function buildSummary(input: {
  modelSummary: string;
  findings: PreparedFinding[];
  reviewed: string[];
  skipped: { path: string; reason: string }[];
  heldBack: number;
}): string {
  const blockers = input.findings.filter((finding) => finding.severity === "blocker");
  const others = input.findings.filter((finding) => finding.severity !== "blocker");
  const lines = ["## Review", ""];
  const note = input.modelSummary.trim();
  if (note) {
    lines.push(note, "");
  }
  lines.push("### Blockers");
  if (blockers.length === 0) lines.push("None.");
  else {
    for (const finding of blockers) {
      lines.push(`- **${finding.title}** in \`${finding.path}:${finding.line}\``);
    }
  }
  lines.push("", "### Also noted");
  if (others.length === 0) lines.push("None.");
  else {
    for (const finding of others) {
      lines.push(`- **${finding.title}** in \`${finding.path}:${finding.line}\``);
    }
  }
  if (input.heldBack > 0) {
    lines.push("", `${input.heldBack} additional note${input.heldBack === 1 ? "" : "s"} held back by the comment budget.`);
  }
  lines.push("", "### Coverage", `Reviewed ${input.reviewed.length} file${input.reviewed.length === 1 ? "" : "s"}.`);
  if (input.skipped.length > 0) {
    const sample = input.skipped.slice(0, 12).map((file) => `\`${file.path}\` (${file.reason})`);
    const extra = input.skipped.length > 12 ? ` and ${input.skipped.length - 12} more` : "";
    lines.push(`Skipped ${input.skipped.length}: ${sample.join(", ")}${extra}.`);
  }
  lines.push("", "Suppress a note with `@reviewer-agent ignore path/to/file.ts:42`.");
  return lines.join("\n");
}

export function isCategory(value: string): value is Category {
  return (
    value === "bugs" ||
    value === "security" ||
    value === "performance" ||
    value === "tests" ||
    value === "apiContracts" ||
    value === "maintainability"
  );
}
