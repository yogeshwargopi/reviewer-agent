import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { Pill } from "@/components/pill";
import { auth } from "@/server/auth";
import { loadReview } from "@/server/queries";
import { CATEGORY_LABELS, type Category } from "@/server/review/policy";
import { formatCost, formatDuration, formatWhen, shortSha } from "@/lib/format";

export const metadata = { title: "Review" };

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const loaded = await loadReview(session.user.id, id);
  if (!loaded) notFound();
  const { review, findings } = loaded;
  const active = review.status === "queued" || review.status === "running";
  const commentBase = review.prUrl ?? "";

  return (
    <div className="space-y-8">
      <LiveRefresh active={active} />
      <header className="space-y-3">
        <Link href="/reviews" className="text-sm text-copper hover:underline">
          All reviews
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-4xl tracking-tight">
            {review.fullName} #{review.pullNumber}
          </h1>
          <Pill value={review.status} />
          {review.dryRun ? <span className="text-sm text-muted">Dry run</span> : null}
        </div>
        <p className="text-muted">{review.prTitle ?? "Untitled pull request"}</p>
      </header>

      <dl className="grid gap-3 rounded-lg border border-line bg-paper-2 p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Commit</dt>
          <dd className="mt-1 font-mono">{shortSha(review.headSha)}</dd>
        </div>
        <div>
          <dt className="text-muted">Duration</dt>
          <dd className="mt-1">{formatDuration(review.startedAt, review.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Model</dt>
          <dd className="mt-1">{review.modelId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Estimated cost</dt>
          <dd className="mt-1">{formatCost(review.estimatedCostUsd)}</dd>
        </div>
      </dl>

      <StateCopy status={review.status} reason={review.skipReason} error={review.error} findingCount={findings.length} />

      {review.summary ? (
        <section className="rounded-lg border border-line bg-paper-2 p-5">
          <h2 className="font-serif text-2xl">Summary</h2>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6">{review.summary}</pre>
        </section>
      ) : null}

      {findings.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Findings</h2>
          {findings.map((finding) => {
            const category = finding.category as Category;
            return (
              <article key={finding.id} className="rounded-lg border border-line bg-paper-2 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill value={finding.severity} />
                  <span className="text-sm text-muted">{CATEGORY_LABELS[category] ?? finding.category}</span>
                  <span className="text-sm text-muted">{finding.confidence}% confidence</span>
                </div>
                <h3 className="mt-3 text-lg">{finding.title}</h3>
                <p className="mt-2 font-mono text-xs text-muted">
                  {finding.path}:{finding.line}
                </p>
                <p className="mt-3 text-sm leading-6">{finding.body}</p>
                {finding.suggestion ? <p className="mt-3 text-sm leading-6">Prefer: {finding.suggestion}</p> : null}
                {finding.githubCommentId && commentBase ? (
                  <a
                    href={`${commentBase}#discussion_r${finding.githubCommentId}`}
                    className="mt-3 inline-block text-sm text-copper hover:underline"
                  >
                    Open on GitHub
                  </a>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <p className="text-xs text-muted">
        Started {formatWhen(review.startedAt)} · Finished {formatWhen(review.finishedAt)}
        {review.promptTokens != null ? ` · ${review.promptTokens} in / ${review.completionTokens ?? 0} out` : ""}
      </p>
    </div>
  );
}

function StateCopy({
  status,
  reason,
  error,
  findingCount,
}: {
  status: string;
  reason: string | null;
  error: string | null;
  findingCount: number;
}) {
  if (status === "queued" || status === "running") {
    return (
      <p className="rounded-lg border border-line bg-warn-soft px-4 py-3 text-sm text-warn">
        Review in progress. This page refreshes until the worker finishes.
      </p>
    );
  }
  if (status === "skipped") {
    return (
      <p className="rounded-lg border border-line bg-paper-2 px-4 py-3 text-sm text-muted">
        Skipped. {reason ?? "This pull request did not match the review rules."}
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="rounded-lg border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">
        {error ?? "The review failed before it could be published."}
      </p>
    );
  }
  if (status === "rate_limited") {
    return (
      <p className="rounded-lg border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">
        GitHub or the model provider rate-limited this run. {error ?? "Retry the review from the pull request."}
      </p>
    );
  }
  if (status === "completed" && findingCount === 0) {
    return (
      <p className="rounded-lg border border-line bg-good-soft px-4 py-3 text-sm text-good">
        No issues cleared the policy bar.
      </p>
    );
  }
  return null;
}
