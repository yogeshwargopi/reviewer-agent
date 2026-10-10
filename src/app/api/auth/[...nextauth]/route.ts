import { NextResponse } from "next/server";
import { auth, handlers } from "@/server/auth";

function installSetupUrl(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/callback/github")) return null;
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  if (!installationId || !/^\d+$/.test(installationId) || !setupAction) return null;
  const setup = new URL("/api/github/setup", url.origin);
  setup.searchParams.set("installation_id", installationId);
  setup.searchParams.set("setup_action", setupAction);
  return setup;
}

export async function GET(request: Request) {
  const setup = installSetupUrl(request);
  if (setup) {
    let signedIn = false;
    try {
      const session = await auth();
      signedIn = Boolean(session?.user);
    } catch {
      signedIn = false;
    }
    if (!signedIn) {
      const signin = new URL("/signin", setup.origin);
      signin.searchParams.set("callbackUrl", `${setup.pathname}${setup.search}`);
      return NextResponse.redirect(signin);
    }
    return NextResponse.redirect(setup);
  }
  return handlers.GET(request);
}

export const POST = handlers.POST;
