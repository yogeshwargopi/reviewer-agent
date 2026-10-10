import { notFound, redirect } from "next/navigation";
import { PolicyForm } from "@/components/policy-form";
import { saveOrganizationPolicy } from "@/server/actions";
import { auth } from "@/server/auth";
import { DEFAULT_POLICY, parsePolicyDocument } from "@/server/review/policy";
import { loadOrganization } from "@/server/queries";

export const metadata = { title: "Policy" };

export default async function PolicyEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { orgId } = await params;
  const query = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const loaded = await loadOrganization(session.user.id, orgId);
  if (!loaded) notFound();
  const policy = loaded.policy ? parsePolicyDocument(loaded.policy.document) : DEFAULT_POLICY;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl tracking-tight">{loaded.organization.accountLogin}</h1>
        <p className="mt-2 text-muted">Organization default. Repositories inherit this until they override it.</p>
      </header>
      {query.saved ? <p className="text-sm text-good">Policy saved.</p> : null}
      <PolicyForm
        action={saveOrganizationPolicy}
        policy={policy}
        hidden={{ organizationId: loaded.organization.id }}
        submitLabel="Save organization policy"
      />
    </div>
  );
}
