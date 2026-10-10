const REQUIRED_FOR_APP = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ENCRYPTION_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
] as const;

const PLACEHOLDERS: Record<string, readonly string[]> = {
  GITHUB_CLIENT_ID: ["local-client-id"],
  GITHUB_CLIENT_SECRET: ["local-client-secret"],
  GITHUB_APP_ID: ["1"],
  GITHUB_APP_PRIVATE_KEY: ["not-a-real-key"],
  GITHUB_WEBHOOK_SECRET: ["local-webhook-secret"],
};

export function isConfiguredValue(key: string, value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  return !(PLACEHOLDERS[key] ?? []).includes(trimmed);
}

export function missingEnv(): string[] {
  return REQUIRED_FOR_APP.filter((key) => !isConfiguredValue(key, process.env[key]));
}

export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function githubAppSlug(): string {
  return process.env.GITHUB_APP_SLUG?.trim() || "reviewer-agent";
}

export function githubPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not set");
  }
  const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const normalized = pem.replace(/\\n/g, "\n");
  if (!normalized.includes("BEGIN")) {
    throw new Error("GITHUB_APP_PRIVATE_KEY must be a PEM or a base64-encoded PEM");
  }
  return normalized;
}

export function integrationFlags() {
  return {
    githubApp: Boolean(
      isConfiguredValue("GITHUB_APP_ID", process.env.GITHUB_APP_ID) &&
        isConfiguredValue("GITHUB_APP_PRIVATE_KEY", process.env.GITHUB_APP_PRIVATE_KEY) &&
        isConfiguredValue("GITHUB_WEBHOOK_SECRET", process.env.GITHUB_WEBHOOK_SECRET),
    ),
    githubOAuth: Boolean(
      isConfiguredValue("GITHUB_CLIENT_ID", process.env.GITHUB_CLIENT_ID) &&
        isConfiguredValue("GITHUB_CLIENT_SECRET", process.env.GITHUB_CLIENT_SECRET),
    ),
    encryption: Boolean(process.env.ENCRYPTION_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || null,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    database: Boolean(process.env.DATABASE_URL),
  };
}
