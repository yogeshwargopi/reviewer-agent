import Link from "next/link";
import { toggleRepository } from "@/server/actions";
import { githubAppSlug, integrationFlags } from "@/server/env";
import { auth } from "@/server/auth";
import { loadWorkspace } from "@/server/queries";
import { ReviewTable } from "@/components/review-table";
import { redirect } from "next/navigation";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const data = await loadWorkspace(session.user.id);
  const flags = integrationFlags();
  const enabled = data.repositories.filter((repo) => repo.enabled).length;
  const installUrl = `https://github.com/apps/${githubAppSlug()}/installations/new`;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Overview</h1>
          <p className="mt-2 max-w-xl text-muted">
            Enable a repository and the next pull request gets a review, inline comments, and a check.
          </p>
        </div>
        <a href={installUrl} className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-copper">
          Install GitHub App
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Enabled repositories" value={String(enabled)} />
        <Stat label="Reviews this week" value={String(data.completedThisWeek)} />
        <Stat label="Connected accounts" value={String(data.installations.length)} />
      </section>

      <section className="rounded-lg border border-line bg-paper-2 p-5">
        <h2 className="font-serif text-2xl">Connection</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Health ok={flags.githubApp} label="GitHub App credentials" />
          <Health ok={flags.githubOAuth} label="GitHub sign-in" />
          <Health ok={flags.encryption} label="Secret encryption" />
          <Health ok={flags.openai || flags.anthropic} label="Platform model key" />
        </ul>
      </section>

      {data.installations.length === 0 ? (
        <section className="rounded-lg border border-dashed border-line bg-paper-2 px-6 py-12 text-center">
          <h2 className="font-serif text-3xl">No installations yet</h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Install the app on your user or organization, then come back here and enable the repositories you want
            reviewed.
          </p>
        </section>
      ) : (
        <section className="space-y-6">
          {data.installations.map((installation) => {
            const repos = data.repositories.filter((repo) => repo.installationId === installation.id);
            return (
              <article key={installation.id} className="rounded-lg border border-line bg-paper-2">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <div>
                    <h2 className="text-lg">{installation.accountLogin}</h2>
                    <p className="text-sm text-muted">
                      {installation.accountType}
                      {installation.suspended ? " · suspended" : ""}
                    </p>
                  </div>
                  <Link href={`/policies/${installation.organizationId}`} className="text-sm text-copper hover:underline">
                    Edit policy
                  </Link>
                </div>
                {repos.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">Repository list is still syncing.</p>
                ) : (
                  <ul>
                    {repos.map((repo) => (
                      <li key={repo.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
                        <div>
                          <Link href={`/repos/${repo.id}`} className="font-medium hover:text-copper">
                            {repo.fullName}
                          </Link>
                          <p className="text-xs text-muted">
                            {repo.private ? "Private" : "Public"} · {repo.policyMode === "override" ? "Custom policy" : "Inherits organization policy"}
                          </p>
                        </div>
                        <form action={toggleRepository}>
                          <input type="hidden" name="repositoryId" value={repo.id} />
                          <input type="hidden" name="enabled" value={repo.enabled ? "false" : "true"} />
                          <button
                            type="submit"
                            className={
                              repo.enabled
                                ? "rounded-full bg-good-soft px-3 py-1 text-xs font-medium text-good"
                                : "rounded-full bg-line px-3 py-1 text-xs font-medium text-muted"
                            }
                          >
                            {repo.enabled ? "Enabled" : "Off"}
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-2xl">Recent reviews</h2>
          <Link href="/reviews" className="text-sm text-copper hover:underline">
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
    <div className="rounded-lg border border-line bg-paper-2 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
    </div>
  );
}

function Health({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between rounded-md bg-paper px-3 py-2">
      <span>{label}</span>
      <span className={ok ? "text-good" : "text-bad"}>{ok ? "Ready" : "Missing"}</span>
    </li>
  );
}
