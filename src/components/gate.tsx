import { PRODUCT_NAME } from "@/lib/brand";

export function Gate({
  missing,
  callbackUrl = "/overview",
  notice,
  manifest = null,
}: {
  missing: string[];
  callbackUrl?: string;
  notice?: string;
  manifest?: string | null;
}) {
  const destination = callbackUrl.startsWith("/") ? callbackUrl : "/overview";
  const otherMissing = missing.filter((key) => !key.startsWith("GITHUB_"));
  const githubMissing = missing.some((key) => key.startsWith("GITHUB_"));
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.18em] text-copper">{PRODUCT_NAME}</p>
      <h1 className="mt-3 font-serif text-5xl leading-tight tracking-tight">A reviewer that knows your standards.</h1>
      <p className="mt-4 text-lg leading-8 text-muted">
        Install it on the repositories you choose. It reads each pull request, applies your policy, and leaves a
        review on the diff.
      </p>
      {notice === "ready" ? (
        <p className="mt-6 text-sm text-ink">GitHub App saved. Sign in with the same GitHub account.</p>
      ) : null}
      {notice === "failed" ? (
        <p className="mt-6 text-sm text-copper">GitHub did not finish creating the app. Create it again.</p>
      ) : null}
      {notice === "webhook" ? (
        <p className="mt-6 text-sm text-copper">A public webhook address could not be reserved. Refresh and try again.</p>
      ) : null}
      {notice === "auth" ? (
        <p className="mt-6 text-sm text-copper">GitHub sign-in did not finish. Use Continue with GitHub again.</p>
      ) : null}
      {otherMissing.length > 0 ? (
        <section className="mt-8 rounded-lg border border-line bg-paper-2 p-5">
          <h2 className="font-medium">Finish configuration</h2>
          <p className="mt-2 text-sm text-muted">
            Set these in <code className="font-mono text-ink">.env</code>:
          </p>
          <ul className="mt-3 space-y-1 font-mono text-sm">
            {otherMissing.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {githubMissing ? (
        <section className="mt-8 rounded-lg border border-line bg-paper-2 p-5">
          <h2 className="font-medium">Create the GitHub App</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            GitHub rejects a blank or localhost webhook, so this uses a public address that forwards events to your
            machine. Confirm the app on your personal account. You can edit the name first. The credentials are saved
            locally, and then sign-in uses that app.
          </p>
          {manifest ? (
            <form className="mt-4" action="https://github.com/settings/apps/new" method="post">
              <input type="hidden" name="manifest" value={manifest} />
              <button type="submit" className="rounded-md bg-ink px-5 py-3 text-sm text-paper hover:bg-copper">
                Create GitHub App
              </button>
            </form>
          ) : null}
        </section>
      ) : otherMissing.length === 0 ? (
        <form
          className="mt-8"
          action={async () => {
            "use server";
            const { signIn } = await import("@/server/auth");
            await signIn("github", { redirectTo: destination });
          }}
        >
          <button type="submit" className="rounded-md bg-ink px-5 py-3 text-sm text-paper hover:bg-copper">
            Continue with GitHub
          </button>
        </form>
      ) : null}
    </main>
  );
}
