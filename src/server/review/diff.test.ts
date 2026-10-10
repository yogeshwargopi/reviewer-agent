import { describe, expect, it } from "vitest";
import { annotatePatch, linesFromAnnotated, selectFiles, skipReason } from "./diff";
import { DEFAULT_POLICY } from "./policy";

const patch = `@@ -1,3 +1,4 @@
 context
-old
+new line
+another
 tail`;

describe("diff selection", () => {
  it("numbers only the right side of a hunk", () => {
    const annotated = annotatePatch(patch);
    expect(linesFromAnnotated(annotated)).toEqual(new Set([1, 2, 3, 4]));
    expect(annotated).toContain("L2:+new line");
    expect(annotated).not.toMatch(/^L\d+:-old/m);
  });

  it("skips lockfiles unless an include glob selects them", () => {
    expect(skipReason("package-lock.json", DEFAULT_POLICY)).toMatch(/package-lock/);
    const included = {
      ...DEFAULT_POLICY,
      includeGlobs: ["package-lock.json"],
    };
    expect(skipReason("package-lock.json", included)).toBeNull();
  });

  it("keeps the riskiest files inside the prompt budget", () => {
    const selected = selectFiles(
      [
        { filename: "README.md", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n-a\n+b\n" },
        {
          filename: "src/auth/session.ts",
          status: "modified",
          additions: 4,
          deletions: 1,
          patch,
        },
      ],
      DEFAULT_POLICY,
      { maxChars: 40, maxFiles: 1 },
    );
    expect(selected.included.map((file) => file.filename)).toEqual(["src/auth/session.ts"]);
    expect(selected.skipped.some((file) => file.path === "README.md")).toBe(true);
  });
});
