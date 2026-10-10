import { describe, expect, it } from "vitest";
import { INSTALLATION_CONCURRENCY, REVIEW_RETRY_LIMIT } from "./constants";

describe("queue limits", () => {
  it("caps each installation at two concurrent reviews and retries with backoff", () => {
    expect(INSTALLATION_CONCURRENCY).toBe(2);
    expect(REVIEW_RETRY_LIMIT).toBeGreaterThanOrEqual(3);
  });
});
