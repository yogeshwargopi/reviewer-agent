import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "./policy";
import {
  buildSummary,
  checkConclusion,
  prepareFindings,
  reviewEvent,
  type PreparedFinding,
} from "./findings";

const valid = new Map<string, Set<number>>([["src/app.ts", new Set([10, 11])]]);

function raw(overrides: Partial<PreparedFinding> = {}) {
  return {
    path: "src/app.ts",
    line: 10,
    severity: "major" as const,
    category: "bugs" as const,
    confidence: 80,
    title: "Missing null check",
    body: "account can be undefined.",
    suggestion: "Return early when account is missing.",
    ...overrides,
  };
}

describe("prepareFindings", () => {
  it("keeps in-diff findings above the policy bar and caps the comment budget", () => {
    const result = prepareFindings({
      raw: [
        raw(),
        raw({ line: 99, title: "Off diff" }),
        raw({ severity: "nit", title: "Nit" }),
        raw({ confidence: 10, title: "Unsure" }),
        raw({ category: "security", title: "Token leak", severity: "blocker", line: 11 }),
        raw({ title: "Second bug", line: 11, severity: "major" }),
      ],
      validLines: valid,
      policy: { ...DEFAULT_POLICY, maxComments: 1, focus: { ...DEFAULT_POLICY.focus, security: true } },
      suppressions: [],
      existingSignatures: new Set(),
      existingCommentKeys: new Set(),
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.severity).toBe("blocker");
    expect(result.heldBack).toBe(1);
    expect(result.dropped["outside diff"]).toBe(1);
    expect(result.dropped["below severity"]).toBe(1);
    expect(result.dropped["below confidence"]).toBe(1);
  });

  it("drops suppressed and already reported notes", () => {
    const result = prepareFindings({
      raw: [raw(), raw({ line: 11, title: "Commented" })],
      validLines: valid,
      policy: DEFAULT_POLICY,
      suppressions: [{ signature: null, path: "src/app.ts", line: 10 }],
      existingSignatures: new Set(),
      existingCommentKeys: new Set(["src/app.ts:11"]),
    });
    expect(result.accepted).toHaveLength(0);
  });
});

describe("review publication", () => {
  it("requests changes only when a blocker survives and the policy says to block", () => {
    const blocker = { ...raw({ severity: "blocker" }), signature: "bugs|src/app.ts|missing null check" };
    expect(reviewEvent(DEFAULT_POLICY, [blocker])).toBe("COMMENT");
    expect(reviewEvent({ ...DEFAULT_POLICY, blockingMode: "request_changes" }, [blocker])).toBe("REQUEST_CHANGES");
    expect(checkConclusion("REQUEST_CHANGES", 1)).toBe("failure");
    expect(checkConclusion("COMMENT", 1)).toBe("neutral");
    expect(checkConclusion("COMMENT", 0)).toBe("success");
  });

  it("lists blockers before coverage", () => {
    const summary = buildSummary({
      modelSummary: "The billing route trusts the client account id.",
      findings: [{ ...raw({ severity: "blocker" }), signature: "x" }],
      reviewed: ["src/app.ts"],
      skipped: [{ path: "package-lock.json", reason: "matched **/package-lock.json" }],
      heldBack: 0,
    });
    expect(summary.indexOf("### Blockers")).toBeLessThan(summary.indexOf("### Coverage"));
    expect(summary).toContain("package-lock.json");
  });
});
