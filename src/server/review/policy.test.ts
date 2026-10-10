import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, decideReview, resolvePolicy } from "./policy";

describe("resolvePolicy", () => {
  it("inherits the organization policy until a repository overrides it", () => {
    const resolved = resolvePolicy(DEFAULT_POLICY, "inherit", { maxComments: 2 });
    expect(resolved.maxComments).toBe(DEFAULT_POLICY.maxComments);
  });

  it("applies repository overrides on top of the organization policy", () => {
    const resolved = resolvePolicy(DEFAULT_POLICY, "override", {
      maxComments: 3,
      blockingMode: "request_changes",
      focus: { bugs: false },
    });
    expect(resolved.maxComments).toBe(3);
    expect(resolved.blockingMode).toBe("request_changes");
    expect(resolved.focus.bugs).toBe(false);
    expect(resolved.focus.security).toBe(true);
  });
});

describe("decideReview", () => {
  const base = {
    action: "opened",
    draft: false,
    enabled: true,
    suspended: false,
    labels: [] as string[],
    triggers: DEFAULT_POLICY.triggers,
    force: false,
  };

  it("reviews opened pull requests on enabled repositories", () => {
    expect(decideReview(base)).toEqual({ action: "review" });
  });

  it("skips drafts unless the command forces a review", () => {
    expect(decideReview({ ...base, draft: true })).toEqual({
      action: "skip",
      reason: "Draft pull requests are skipped",
    });
    expect(decideReview({ ...base, draft: true, force: true })).toEqual({ action: "review" });
  });

  it("skips the skip-review label and ignores disabled repositories", () => {
    expect(decideReview({ ...base, labels: ["skip-review"] }).action).toBe("skip");
    expect(decideReview({ ...base, enabled: false })).toEqual({ action: "ignore" });
  });

  it("ignores triggers the policy turns off", () => {
    expect(
      decideReview({
        ...base,
        action: "synchronize",
        triggers: { ...DEFAULT_POLICY.triggers, synchronize: false },
      }),
    ).toEqual({ action: "ignore" });
  });
});
