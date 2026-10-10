import { describe, expect, it } from "vitest";
import { parseCommand, parseIgnoreTarget } from "./commands";

describe("pull request commands", () => {
  it("recognizes review and ignore commands", () => {
    expect(parseCommand("please @reviewer-agent review this")).toEqual({ type: "review" });
    expect(parseCommand("@reviewer-agent ignore src/app.ts:10")).toEqual({
      type: "ignore",
      target: "src/app.ts:10",
    });
    expect(parseCommand("looks good")).toBeNull();
  });

  it("splits ignore targets into path, line, or signature", () => {
    expect(parseIgnoreTarget("src/app.ts:10")).toEqual({ path: "src/app.ts", line: 10 });
    expect(parseIgnoreTarget("src/app.ts")).toEqual({ path: "src/app.ts" });
    expect(parseIgnoreTarget("bugs|src/app.ts|missing null check").signature).toContain("|");
  });
});
