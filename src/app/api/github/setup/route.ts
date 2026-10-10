import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { grantInstallationAccess } from "@/server/access";
import { auth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { installations } from "@/server/db/schema";
import { syncInstallationFromGitHub } from "@/server/github/sync";
import { log } from "@/server/log";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
  }

  if (installationId && /^\d+$/.test(installationId)) {
    try {
      const installation = await syncInstallationFromGitHub(Number(installationId));
      await grantInstallationAccess(session.user.id, installation.id);
    } catch (error) {
      log.warn("setup.sync_failed", {
        installationId,
        message: error instanceof Error ? error.message.slice(0, 180) : "failed",
      });
      const [existing] = await getDb()
        .select({ id: installations.id })
        .from(installations)
        .where(eq(installations.githubInstallationId, installationId))
        .limit(1);
      if (existing) await grantInstallationAccess(session.user.id, existing.id);
    }
  }

  redirect("/overview");
}
