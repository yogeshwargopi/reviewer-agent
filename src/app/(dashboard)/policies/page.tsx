import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { loadWorkspace } from "@/server/queries";

export const metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const data = await loadWorkspace(session.user.id);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl tracking-tight">Policies</h1>
        <p className="mt-2 max-w-xl text-muted">
          Each organization has one default. A repository inherits it until you customize that repository.
        </p>
      </header>
      {data.organizations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-sm text-muted">
          Install the GitHub App to create an organization policy.
        </div>
      ) : (
        <ul className="grid gap-3">
          {data.organizations.map((organization) => (
            <li key={organization.id}>
              <Link
                href={`/policies/${organization.id}`}
                className="block rounded-lg border border-line bg-paper-2 px-5 py-4 hover:border-copper"
              >
                <span className="text-lg">{organization.accountLogin}</span>
                <span className="mt-1 block text-sm text-muted">{organization.accountType} default</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
