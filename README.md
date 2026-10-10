# Reviewer

Reviewer is a self-hosted GitHub App. It reviews every enabled pull request with a hosted model, then publishes one review, inline comments on changed lines, and a `reviewer-agent` check.

You run it yourself. Organizations, installations, repositories, and policies are first-class, so another GitHub account can be connected later without a rewrite.

## What a review does

On pull request open, update, reopen, or ready-for-review, the app:

1. Verifies the webhook signature and ignores a delivery it has already seen.
2. Applies the organization policy, or the repository override.
3. Sends the risky parts of the diff to OpenAI or Anthropic.
4. Posts a summary plus at most the comment budget, only on lines in the diff.
5. Sets the check to success, neutral, failure, or skipped.

Blockers request changes only when the policy says so. The app never approves a pull request.

Drafts are skipped. A `skip-review` label skips the pull request. `@reviewer-agent review` forces a run. `@reviewer-agent ignore path/to/file.ts:42` suppresses that note later.

## Local setup

1. Start Postgres:

```bash
docker compose up postgres -d
```

2. Copy the environment file and fill it in:

```bash
cp .env.example .env
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

3. Migrate, then run the web app and the worker in two terminals:

```bash
npm run db:migrate
npm run dev
npm run worker
```

The app is at [http://localhost:3000](http://localhost:3000).

`docker compose up` builds the web and worker containers when you want the whole stack. Those services read `.env` and point `DATABASE_URL` at the Postgres container.

## GitHub App

Open [http://localhost:3000](http://localhost:3000) and choose **Create GitHub App**. Confirm it on your personal GitHub account. The app writes the client id, client secret, app id, private key, and webhook secret into `.env`. You can also create the app yourself at [github.com/settings/apps/new](https://github.com/settings/apps/new) and paste those values in.

| Setting | Value |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Callback URL | `http://localhost:3000/api/auth/callback/github` |
| Setup URL | `http://localhost:3000/api/github/setup` |
| Request user authorization during installation | On |
| Webhook URL | `https://<your-tunnel>/api/github/webhook` |
| Webhook secret | Same value as `GITHUB_WEBHOOK_SECRET` |

GitHub rejects a blank or localhost webhook. The create button reserves a public `smee.io` address, stores it as `GITHUB_WEBHOOK_URL`, and the dev server forwards those events to `http://localhost:3000/api/github/webhook`. Replace that URL in the GitHub App settings when you have your own public HTTPS endpoint.

Permissions:

- Contents: Read
- Pull requests: Read and write
- Checks: Read and write
- Metadata: Read

Events: `pull_request`, `issue_comment`, `installation`, `installation_repositories`.

The home page button writes the App ID, private key, client id, client secret, slug, and webhook secret into `.env`. If you created the app by hand, copy those values in yourself. The webhook is left inactive until you put a public HTTPS URL in the GitHub App settings. Install the app from the Overview page, then enable each repository you want reviewed.

## Policies

The organization default controls focus, playbook, path globs, severity, confidence, comment budget, blocking mode, triggers, and model. A repository inherits that default until you choose **Customize this repository**. Include globs override exclude globs, so a lockfile stays out unless you name it.

**Dry run latest pull request** stores findings in the dashboard and does not post to GitHub.

Model keys saved in Settings are encrypted with `ENCRYPTION_KEY`. If an organization has no key, the app uses `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Set `OPENAI_BASE_URL` when the key belongs to an OpenAI-compatible gateway. The default model is `gpt-6-luna`.

## Operations

- Webhooks return immediately. The worker performs the review.
- A delivery id is stored once. Replays do not start a second review.
- The same head SHA does not get two published reviews. A failed or skipped run can be retried.
- Each installation runs at most two reviews at a time. Jobs retry with backoff and expire after 15 minutes if a worker dies.
- Logs record ids, counts, and safe error text. Diffs, prompts, and keys are not logged.

## Scripts

```bash
npm test
npm run lint
npm run db:generate
npm run worker
```
