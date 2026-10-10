import { redirect } from "next/navigation";
import { Gate } from "@/components/gate";
import { missingEnv } from "@/server/env";
import { createFormManifest } from "@/server/github/manifest";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const params = await searchParams;
  const missing = missingEnv();
  const needsGithub = missing.some((key) => key.startsWith("GITHUB_"));
  const manifest = needsGithub ? await createFormManifest() : null;
  const notice = needsGithub && !manifest ? "webhook" : params.github;
  if (missing.length > 0) return <Gate missing={missing} notice={notice} manifest={manifest} />;
  const { auth } = await import("@/server/auth");
  const session = await auth();
  if (session?.user) redirect("/overview");
  return <Gate missing={[]} notice={params.github} />;
}
