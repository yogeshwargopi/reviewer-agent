import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { reviewerSql?: ReturnType<typeof postgres>; reviewerDb?: Database };

export function getDb(): Database {
  if (globalForDb.reviewerDb) return globalForDb.reviewerDb;
  const url =
    process.env.DATABASE_URL ??
    (process.env.NEXT_PHASE === "phase-production-build"
      ? "postgres://reviewer:reviewer@127.0.0.1:5432/reviewer"
      : undefined);
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  globalForDb.reviewerSql = sql;
  globalForDb.reviewerDb = db;
  return db;
}
