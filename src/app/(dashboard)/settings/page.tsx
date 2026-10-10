import { redirect } from "next/navigation";
import { deleteProviderKey, saveProviderKey } from "@/server/actions";
import { auth } from "@/server/auth";
import { integrationFlags } from "@/server/env";
import { savedProviders, loadWorkspace } from "@/server/queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const data = await loadWorkspace(session.user.id);
  const flags = integrationFlags();
  const keys = await savedProviders(data.organizations.map((organization) => organization.id));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-4xl tracking-tight">Settings</h1>
        <p className="mt-2 max-w-xl text-muted">
          Organization keys override the platform keys. Keys are encrypted before they are stored.
        </p>
      </header>
      {query.saved ? <p className="text-sm text-good">Settings saved.</p> : null}
      {query.notice === "empty" ? <p className="text-sm text-bad">Enter a key before saving.</p> : null}

      <section className="rounded-lg border border-line bg-paper-2 p-5 text-sm">
        <h2 className="font-serif text-2xl">Platform keys</h2>
        <p className="mt-2 text-muted">Used when an organization has not saved its own key.</p>
        <ul className="mt-4 space-y-2">
          <li>OpenAI environment key: {flags.openai ? "present" : "not set"}</li>
          <li>OpenAI gateway: {flags.openaiBaseUrl ?? "https://api.openai.com/v1"}</li>
          <li>Anthropic environment key: {flags.anthropic ? "present" : "not set"}</li>
        </ul>
      </section>

      {data.organizations.length === 0 ? (
        <p className="text-sm text-muted">Install the GitHub App before saving organization keys.</p>
      ) : (
        data.organizations.map((organization) => {
          const saved = new Set(
            keys.filter((key) => key.organizationId === organization.id).map((key) => key.provider),
          );
          return (
            <section key={organization.id} className="rounded-lg border border-line bg-paper-2 p-5">
              <h2 className="font-serif text-2xl">{organization.accountLogin}</h2>
              {(["openai", "anthropic"] as const).map((provider) => (
                <div key={provider} className="mt-5 border-t border-line pt-4">
                  <p className="text-sm">
                    {provider === "openai" ? "OpenAI" : "Anthropic"} · {saved.has(provider) ? "key saved" : "using platform key"}
                  </p>
                  <form action={saveProviderKey} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="organizationId" value={organization.id} />
                    <input type="hidden" name="provider" value={provider} />
                    <input
                      type="password"
                      name="apiKey"
                      autoComplete="off"
                      placeholder="Paste a new key"
                      className="min-w-64 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm"
                    />
                    <button type="submit" className="rounded-md bg-copper px-3 py-2 text-sm text-paper hover:bg-copper-deep">
                      Save key
                    </button>
                  </form>
                  {saved.has(provider) ? (
                    <form action={deleteProviderKey} className="mt-2">
                      <input type="hidden" name="organizationId" value={organization.id} />
                      <input type="hidden" name="provider" value={provider} />
                      <button type="submit" className="text-sm text-copper hover:underline">
                        Remove saved key
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
