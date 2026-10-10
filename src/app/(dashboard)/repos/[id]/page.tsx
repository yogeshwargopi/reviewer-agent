import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PolicyForm } from "@/components/policy-form";
import {
  customizeRepository,
  saveRepositoryOverride,
  startDryRun,
  useOrganizationDefault,
} from "@/server/actions";
import { auth } from "@/server/auth";
import { parseOverrides, parsePolicyDocument, resolvePolicy, DEFAULT_POLICY } from "@/server/review/policy";
import { loadRepository } from "@/server/queries";

export const metadata = { title: "Repository" };

const notices: Record<string, string> = {
  "no-pr": "This repository has no open pull request to dry-run.",
  "dry-run-failed": "The dry run could not be queued. Check the GitHub App credentials and try again.",
};

export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const loaded = await loadRepository(session.user.id, id);
  if (!loaded?.organization) notFound();
  const base = loaded.policy ? parsePolicyDocument(loaded.policy.document) : DEFAULT_POLICY;
  const resolved = resolvePolicy(base, loaded.repository.policyMode, parseOverrides(loaded.repository.overrides));
  const inherits = loaded.repository.policyMode !== "override";

  return (
    <div className="space-y-8">
      <header>
        <Link href="/overview" className="text-sm text-copper hover:underline">
          Overview
        </Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{loaded.repository.fullName}</h1>
        <p className="mt-2 text-muted">
          {inherits
            ? `Inherits the ${loaded.organization.accountLogin} default.`
            : "This repository overrides the organization default."}
        </p>
      </header>

      {query.saved ? <p className="text-sm text-good">Repository settings saved.</p> : null}
      {query.notice && notices[query.notice] ? <p className="text-sm text-bad">{notices[query.notice]}</p> : null}

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper-2 p-5">
        <form action={startDryRun}>
          <input type="hidden" name="repositoryId" value={loaded.repository.id} />
          <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-copper">
            Dry run latest pull request
          </button>
        </form>
        <p className="text-sm text-muted">Shows findings here and does not post to GitHub.</p>
      </section>

      {inherits ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-copper/30 bg-copper-soft px-4 py-3 text-sm text-copper">
            Inherits organization default. Changes below are not saved until you customize this repository.
          </div>
          <form action={customizeRepository}>
            <input type="hidden" name="repositoryId" value={loaded.repository.id} />
            <button type="submit" className="rounded-md border border-ink px-4 py-2 text-sm hover:bg-ink hover:text-paper">
              Customize this repository
            </button>
          </form>
          <PolicySummary policyName={loaded.organization.accountLogin} />
          <Link href={`/policies/${loaded.organization.id}`} className="text-sm text-copper hover:underline">
            Edit the organization policy
          </Link>
        </section>
      ) : (
        <section className="space-y-4">
          <form action={useOrganizationDefault}>
            <input type="hidden" name="repositoryId" value={loaded.repository.id} />
            <button type="submit" className="text-sm text-copper hover:underline">
              Use organization default
            </button>
          </form>
          <PolicyForm
            action={saveRepositoryOverride}
            policy={resolved}
            hidden={{ repositoryId: loaded.repository.id }}
            submitLabel="Save repository override"
          />
        </section>
      )}
    </div>
  );
}

function PolicySummary({ policyName }: { policyName: string }) {
  return (
    <p className="text-sm text-muted">
      Comments, severity, model, and playbook currently come from {policyName}.
    </p>
  );
}
