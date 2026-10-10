import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { safeErrorMessage } from "./errors";

describe("secret encryption", () => {
  it("round-trips a key and rejects a tampered payload", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSecret("sk-test-value");
    expect(decryptSecret(encrypted)).toBe("sk-test-value");
    expect(() => decryptSecret({ ...encrypted, ciphertext: Buffer.from("nope").toString("base64") })).toThrow();
  });
});

describe("safe errors", () => {
  it("does not surface source or private keys", () => {
    expect(safeErrorMessage(new Error(`-----BEGIN PRIVATE KEY-----\n${"a".repeat(20)}`))).toMatch(/omitted/);
    expect(safeErrorMessage(new Error("diff --git a/file b/file"))).toMatch(/omitted/);
  });
});
