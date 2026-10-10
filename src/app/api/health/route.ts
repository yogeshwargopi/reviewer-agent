import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, database: false }, { status: 503 });
  }
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, database: false }, { status: 503 });
  }
}
