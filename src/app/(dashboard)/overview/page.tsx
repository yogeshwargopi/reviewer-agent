import Link from "next/link";
import { toggleRepository } from "@/server/actions";
import { githubAppSlug, integrationFlags } from "@/server/env";
import { auth } from "@/server/auth";
import { loadWorkspace } from "@/server/queries";
import { ReviewTable } from "@/components/review-table";
import { redirect } from "next/navigation";

export const metadata = { title: "Overview" };

const card = "rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(20,18,28,0.04)]";

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const data = await loadWorkspace(session.user.id);
  const flags = integrationFlags();
  const enabled = data.repositories.filter((repo) => repo.enabled).length;
  const installUrl = `https://github.com/apps/${githubAppSlug()}/installations/new`;
  const checks = [
    { ok: flags.githubApp, label: "GitHub App credentials" },
    { ok: flags.githubOAuth, label: "GitHub sign-in" },
    { ok: flags.encryption, label: "Secret encryption" },
    { ok: flags.openai || flags.anthropic, label: "Platform model key" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl tracking-tight">Overview</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enable a repository and the next pull request gets a review, inline comments, and a check.
          </p>
        </div>
        <a
          href={installUrl}
          className="rounded-lg bg-copper px-4 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:bg-copper-deep"
        >
          Install GitHub App
        </a>
      </header>

      <section className={`${card} grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
        <Stat label="Enabled repositories" value={String(enabled)} />
        <Stat label="Reviews this week" value={String(data.completedThisWeek)} />
        <Stat label="Connected accounts" value={String(data.installations.length)} />
      </section>

      <section className={`${card} p-6`}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-2xl tracking-tight">Connection</h2>
          <p className="text-sm text-muted">{checks.every((check) => check.ok) ? "All systems ready" : "Needs attention"}</p>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {checks.map((check) => (
            <Health key={check.label} ok={check.ok} label={check.label} />
          ))}
        </ul>
      </section>

      {data.installations.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line bg-paper px-6 py-16 text-center">
          <h2 className="font-serif text-3xl tracking-tight">No installations yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            Install the app on your user or organization, then come back here and enable the repositories you want
            reviewed.
          </p>
        </section>
      ) : (
        <section className="space-y-5">
          {data.installations.map((installation) => {
            const repos = data.repositories.filter((repo) => repo.installationId === installation.id);
            const initial = installation.accountLogin.slice(0, 1).toUpperCase();
            return (
              <article key={installation.id} className={card}>
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-copper-soft text-sm font-medium text-copper">
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium">{installation.accountLogin}</h2>
                      <p className="text-xs text-muted">
                        {installation.accountType}
                        {installation.suspended ? " · suspended" : ""}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/policies/${installation.organizationId}`}
                    className="shrink-0 text-sm font-medium text-copper transition hover:text-copper-deep"
                  >
                    Edit policy
                  </Link>
                </div>
                {repos.length === 0 ? (
                  <p className="border-t border-line px-5 py-6 text-sm text-muted">Repository list is still syncing.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {repos.map((repo) => (
                      <li key={repo.id} className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-canvas">
                        <div className="min-w-0">
                          <Link href={`/repos/${repo.id}`} className="block truncate text-sm font-medium hover:text-copper">
                            {repo.fullName}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            {repo.private ? "Private" : "Public"} ·{" "}
                            {repo.policyMode === "override" ? "Custom policy" : "Inherits organization policy"}
                          </p>
                        </div>
                        <form action={toggleRepository}>
                          <input type="hidden" name="repositoryId" value={repo.id} />
                          <input type="hidden" name="enabled" value={repo.enabled ? "false" : "true"} />
                          <button type="submit" aria-pressed={repo.enabled} className="inline-flex items-center gap-2.5">
                            <span
                              className={
                                repo.enabled
                                  ? "relative inline-flex h-5 w-9 items-center rounded-full bg-copper"
                                  : "relative inline-flex h-5 w-9 items-center rounded-full bg-[#dddbe3]"
                              }
                            >
                              <span
                                className={
                                  repo.enabled
                                    ? "inline-block size-3.5 translate-x-5 rounded-full bg-paper shadow-sm"
                                    : "inline-block size-3.5 translate-x-0.5 rounded-full bg-paper shadow-sm"
                                }
                              />
                            </span>
                            <span className={repo.enabled ? "w-6 text-left text-xs font-medium text-ink" : "w-6 text-left text-xs text-muted"}>
                              {repo.enabled ? "On" : "Off"}
                            </span>
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl tracking-tight">Recent reviews</h2>
          <Link href="/reviews" className="text-sm font-medium text-copper transition hover:text-copper-deep">
            View all
          </Link>
        </div>
        <ReviewTable reviews={data.reviews.slice(0, 8)} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-3 font-serif text-4xl tracking-tight">{value}</p>
    </div>
  );
}

function Health({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      <span className={ok ? "size-2 shrink-0 rounded-full bg-good" : "size-2 shrink-0 rounded-full bg-bad"} />
      <span className="min-w-0 truncate">{label}</span>
      <span className="ml-auto text-xs text-muted">{ok ? "Ready" : "Missing"}</span>
    </li>
  );
}
