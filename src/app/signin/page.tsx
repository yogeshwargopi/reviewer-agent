import { Gate } from "@/components/gate";
import { missingEnv } from "@/server/env";
import { createFormManifest } from "@/server/github/manifest";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; github?: string; error?: string }>;
}) {
  const params = await searchParams;
  const missing = missingEnv();
  const needsGithub = missing.some((key) => key.startsWith("GITHUB_"));
  const manifest = needsGithub ? await createFormManifest() : null;
  const notice = needsGithub && !manifest ? "webhook" : params.error ? "auth" : params.github;
  if (missing.length > 0) return <Gate missing={missing} notice={notice} manifest={manifest} />;
  return <Gate missing={[]} callbackUrl={params.callbackUrl ?? "/overview"} notice={notice} />;
}
