import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { githubPrivateKey } from "../env";

let app: App<{ Octokit: typeof Octokit }> | null = null;

export function getGitHubApp() {
  if (app) return app;
  const appId = process.env.GITHUB_APP_ID;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!appId || !webhookSecret) {
    throw new Error("GitHub App credentials are not configured");
  }
  app = new App({
    appId,
    privateKey: githubPrivateKey(),
    webhooks: { secret: webhookSecret },
    Octokit,
  });
  return app;
}

export async function installationClient(githubInstallationId: number) {
  return getGitHubApp().getInstallationOctokit(githubInstallationId);
}

export type InstallationClient = Awaited<ReturnType<typeof installationClient>>;
