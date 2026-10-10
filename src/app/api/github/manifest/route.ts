import { NextResponse } from "next/server";
import { registerAppFromManifest } from "@/server/github/manifest";
import { log } from "@/server/log";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const home = new URL("/", url.origin);
  if (!code) {
    home.searchParams.set("github", "failed");
    return NextResponse.redirect(home);
  }
  try {
    await registerAppFromManifest(code);
    home.searchParams.set("github", "ready");
    return NextResponse.redirect(home);
  } catch (error) {
    log.warn("github.manifest_failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "failed",
    });
    home.searchParams.set("github", "failed");
    return NextResponse.redirect(home);
  }
}
