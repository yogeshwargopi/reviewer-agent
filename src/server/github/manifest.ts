import { randomBytes } from "node:crypto";
import { PRODUCT_NAME, USER_AGENT } from "@/lib/brand";
import { appUrl } from "@/server/env";
import { writeEnvValues } from "@/server/env-file";
import { log } from "@/server/log";
import { ensurePublicWebhookUrl } from "@/server/github/webhook-proxy";

type CreatedApp = {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
};

export function buildGithubAppManifest(webhookUrl: string) {
  const origin = appUrl();
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    name: `${PRODUCT_NAME} ${suffix}`,
    url: origin,
    public: false,
    request_oauth_on_install: true,
    setup_on_update: true,
    callback_urls: [`${origin}/api/auth/callback/github`],
    setup_url: `${origin}/api/github/setup`,
    redirect_url: `${origin}/api/github/manifest`,
    hook_attributes: {
      url: webhookUrl,
      active: true,
    },
    default_permissions: {
      contents: "read",
      issues: "read",
      pull_requests: "write",
      checks: "write",
      metadata: "read",
    },
    default_events: ["pull_request", "issue_comment"],
  };
}

export async function githubAppManifest() {
  return buildGithubAppManifest(await ensurePublicWebhookUrl());
}

export async function createFormManifest() {
  try {
    return JSON.stringify(await githubAppManifest());
  } catch (error) {
    log.warn("github.webhook_url_failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "failed",
    });
    return null;
  }
}

export async function registerAppFromManifest(code: string) {
  if (!/^[A-Za-z0-9_-]{8,}$/.test(code)) {
    throw new Error("GitHub returned an invalid registration code");
  }
  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub app registration failed (${response.status})`);
  }
  const created = (await response.json()) as CreatedApp;
  if (!created.client_id || !created.client_secret || !created.pem || !created.id) {
    throw new Error("GitHub app registration returned an incomplete app");
  }
  writeEnvValues({
    GITHUB_APP_ID: String(created.id),
    GITHUB_APP_SLUG: created.slug,
    GITHUB_CLIENT_ID: created.client_id,
    GITHUB_CLIENT_SECRET: created.client_secret,
    GITHUB_APP_PRIVATE_KEY: Buffer.from(created.pem, "utf8").toString("base64"),
    GITHUB_WEBHOOK_SECRET: created.webhook_secret || randomBytes(32).toString("hex"),
  });
}
