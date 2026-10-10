import type { Policy } from "./policy";
import type { SelectedFile } from "./diff";

export function buildPrompt(policy: Policy, files: SelectedFile[]): string {
  const focus = Object.entries(policy.focus)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
  const fileBlocks = files
    .map((file) => {
      const note = file.truncated ? "\n(This file was truncated to fit the review budget.)" : "";
      return `### ${file.filename} (${file.status})${note}\n${file.annotated}`;
    })
    .join("\n\n");

  return [
    "Review this pull request diff.",
    `Enabled focus areas: ${focus || "none"}.`,
    `Minimum severity to report: ${policy.minSeverity}.`,
    `Only report findings you would score at confidence ${policy.confidenceFloor} or higher.`,
    "Every finding must use a path and a line number that appears as an L<number>: prefix in the diff.",
    "Do not comment on unchanged lines, lockfiles, or files that are not shown.",
    "Style nits are out of scope unless the playbook explicitly asks for them.",
    "Each finding must say what is wrong, why it matters, and the preferred fix.",
    policy.playbook.trim() ? `Repository playbook:\n${policy.playbook.trim()}` : "Repository playbook: none.",
    "",
    fileBlocks,
  ].join("\n");
}

export const REVIEW_SYSTEM_PROMPT = [
  "You are a senior staff engineer reviewing a pull request for a team that will read every comment.",
  "Be specific, calm, and brief. Do not narrate the diff. Do not praise the author.",
  "Report only defects you can defend from the diff: bugs, security issues, performance problems, missing tests, broken API contracts, and maintainability hazards.",
  "Never approve the pull request. Never invent line numbers.",
  "suggestion is the preferred fix in one or two sentences. Use an empty string when the body already states the fix.",
].join(" ");
