import { describe, expect, it } from "vitest";
import { isConfiguredValue } from "./env";

describe("isConfiguredValue", () => {
  it("rejects the local GitHub placeholders", () => {
    expect(isConfiguredValue("GITHUB_CLIENT_ID", "local-client-id")).toBe(false);
    expect(isConfiguredValue("GITHUB_CLIENT_SECRET", "local-client-secret")).toBe(false);
    expect(isConfiguredValue("GITHUB_APP_PRIVATE_KEY", "not-a-real-key")).toBe(false);
    expect(isConfiguredValue("GITHUB_APP_ID", "1")).toBe(false);
    expect(isConfiguredValue("GITHUB_CLIENT_ID", "")).toBe(false);
  });

  it("accepts a real client id", () => {
    expect(isConfiguredValue("GITHUB_CLIENT_ID", "Iv1.abc123")).toBe(true);
  });
});
