import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "./signature";

describe("webhook signatures", () => {
  it("accepts a matching signature and rejects the others", () => {
    const payload = JSON.stringify({ zen: "keep it simple" });
    const signature = signPayload("secret", payload);
    expect(verifySignature("secret", payload, signature)).toBe(true);
    expect(verifySignature("secret", payload, null)).toBe(false);
    expect(verifySignature("secret", payload, "sha256=dead")).toBe(false);
    expect(verifySignature("other", payload, signature)).toBe(false);
  });
});
