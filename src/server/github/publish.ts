import { githubAppSlug } from "../env";
import { httpStatus } from "../errors";
import { log } from "../log";
import { CHECK_NAME } from "../jobs/constants";
import type { PreparedFinding } from "../review/findings";
import type { InstallationClient } from "./app";
import type { DiffFile } from "../review/diff";

export function botLogin(): string {
  return `${githubAppSlug()}[bot]`;
}

export async function fetchPullFiles(
  client: InstallationClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<DiffFile[]> {
  const files: DiffFile[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await client.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });
    for (const file of data) {
      files.push({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
        previousFilename: file.previous_filename,
      });
    }
    if (data.length < 100) break;
  }
  return files;
}

const THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 1) {
              nodes {
                author { login }
                path
                line
              }
            }
          }
        }
      }
    }
  }
`;

type ThreadResponse = {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: Array<{
          isResolved: boolean;
          comments: {
            nodes: Array<{ author: { login: string } | null; path: string; line: number | null } | null>;
          };
        } | null> | null;
      };
    } | null;
  } | null;
};

export async function unresolvedBotCommentKeys(
  client: InstallationClient,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const login = botLogin();
  try {
    const data = await client.graphql<ThreadResponse>(THREADS_QUERY, {
      owner,
      name: repo,
      number: pullNumber,
    });
    for (const thread of data.repository?.pullRequest?.reviewThreads.nodes ?? []) {
      if (!thread || thread.isResolved) continue;
      const comment = thread.comments.nodes[0];
      if (!comment || comment.author?.login !== login || comment.line == null) continue;
      keys.add(`${comment.path}:${comment.line}`);
    }
    return keys;
  } catch (error) {
    log.warn("review.threads_unavailable", { owner, repo, pullNumber, status: httpStatus(error) });
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data } = await client.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });
    for (const comment of data) {
      if (comment.user?.login !== login) continue;
      const line = comment.line ?? comment.original_line;
      if (line == null) continue;
      keys.add(`${comment.path}:${line}`);
    }
    if (data.length < 100) break;
  }
  return keys;
}

export async function publishPullRequestReview(input: {
  client: InstallationClient;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  event: "COMMENT" | "REQUEST_CHANGES";
  body: string;
  comments: Array<{ path: string; line: number; body: string }>;
}): Promise<{ reviewId: number; droppedInline: boolean }> {
  const base = {
    owner: input.owner,
    repo: input.repo,
    pull_number: input.pullNumber,
    commit_id: input.headSha,
    event: input.event,
  };
  try {
    const { data } = await input.client.rest.pulls.createReview({
      ...base,
      body: input.body,
      comments: input.comments.length
        ? input.comments.map((comment) => ({
            path: comment.path,
            line: comment.line,
            side: "RIGHT" as const,
            body: comment.body,
          }))
        : undefined,
    });
    return { reviewId: data.id, droppedInline: false };
  } catch (error) {
    if (httpStatus(error) !== 422 || input.comments.length === 0) throw error;
    const { data } = await input.client.rest.pulls.createReview({
      ...base,
      body: `${input.body}\n\nInline comments could not be attached to this diff, so the notes are listed above.`,
    });
    return { reviewId: data.id, droppedInline: true };
  }
}

export async function matchPublishedComments(input: {
  client: InstallationClient;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}): Promise<Map<string, string>> {
  const matched = new Map<string, string>();
  const login = botLogin();
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await input.client.rest.pulls.listReviewComments({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullNumber,
      per_page: 100,
      page,
    });
    for (const comment of data) {
      if (comment.user?.login !== login || comment.commit_id !== input.headSha) continue;
      const line = comment.line ?? comment.original_line;
      if (line == null) continue;
      matched.set(`${comment.path}:${line}`, String(comment.id));
    }
    if (data.length < 100) break;
  }
  return matched;
}

export async function openCheck(
  client: InstallationClient,
  owner: string,
  repo: string,
  headSha: string,
): Promise<number> {
  const { data } = await client.rest.checks.create({
    owner,
    repo,
    name: CHECK_NAME,
    head_sha: headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "Reviewing pull request",
      summary: "Reading the diff and applying the repository policy.",
    },
  });
  return data.id;
}

export async function completeCheck(input: {
  client: InstallationClient;
  owner: string;
  repo: string;
  checkRunId: number;
  conclusion: "success" | "failure" | "neutral" | "skipped";
  title: string;
  summary: string;
  findings?: PreparedFinding[];
}) {
  await input.client.rest.checks.update({
    owner: input.owner,
    repo: input.repo,
    check_run_id: input.checkRunId,
    status: "completed",
    conclusion: input.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: input.title,
      summary: input.summary.slice(0, 60_000),
      annotations: (input.findings ?? []).slice(0, 40).map((finding) => ({
        path: finding.path,
        start_line: finding.line,
        end_line: finding.line,
        annotation_level:
          finding.severity === "blocker" || finding.severity === "major" ? ("failure" as const) : ("warning" as const),
        message: finding.title.slice(0, 200),
        title: finding.category,
      })),
    },
  });
}

export async function createSkippedCheck(input: {
  client: InstallationClient;
  owner: string;
  repo: string;
  headSha: string;
  reason: string;
}) {
  const { data } = await input.client.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: CHECK_NAME,
    head_sha: input.headSha,
    status: "completed",
    conclusion: "skipped",
    completed_at: new Date().toISOString(),
    output: {
      title: "Review skipped",
      summary: input.reason,
    },
  });
  return data.id;
}

export async function replyOnPullRequest(
  client: InstallationClient,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
) {
  await client.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
}

export async function latestOpenPull(client: InstallationClient, owner: string, repo: string) {
  const { data } = await client.rest.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 1,
  });
  return data[0] ?? null;
}
