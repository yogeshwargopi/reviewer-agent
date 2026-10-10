import { describe, expect, it } from "vitest";
import { buildGithubAppManifest } from "./manifest";

describe("buildGithubAppManifest", () => {
  it("sends GitHub a public webhook and only the events it accepts", () => {
    const manifest = buildGithubAppManifest("https://smee.io/example");
    expect(manifest.hook_attributes).toEqual({ url: "https://smee.io/example", active: true });
    expect(manifest.default_events).toEqual(["pull_request", "issue_comment"]);
    expect(manifest.default_permissions.issues).toBe("read");
    expect(JSON.stringify(manifest)).not.toContain("localhost:3000/api/github/webhook");
  });
});
