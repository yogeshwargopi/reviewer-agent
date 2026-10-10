export class AppError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function httpStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message.slice(0, 280);
  const status = httpStatus(error);
  if (status === 401) return "GitHub rejected the app credentials.";
  if (status === 403) return "GitHub refused this request. Check the app permissions.";
  if (status === 404) return "The pull request or repository is no longer available.";
  if (status === 422) return "GitHub rejected the review payload.";
  if (status === 429) return "GitHub rate limit reached.";
  const message = error instanceof Error ? error.message : "Review failed";
  if (
    message.length > 280 ||
    message.includes("diff --git") ||
    message.includes("BEGIN ") ||
    /api[_-]?key/i.test(message)
  ) {
    return "Review failed. Details were omitted from the log.";
  }
  return message.slice(0, 280);
}

export function isRateLimited(error: unknown): boolean {
  if (error instanceof AppError && error.code === "rate_limited") return true;
  if (httpStatus(error) === 429) return true;
  const message = error instanceof Error ? error.message : "";
  return /rate limit/i.test(message);
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) return error.retryable;
  if (isRateLimited(error)) return true;
  const status = httpStatus(error);
  if (status && status >= 500) return true;
  if (status && status >= 400) return false;
  const message = error instanceof Error ? error.message : "";
  return /fetch failed|network|ECONN|ETIMEDOUT|socket|timed out/i.test(message);
}
