import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@core/db/schema.pg.js";

/**
 * Server-only Postgres handle.
 *
 * DATABASE_URL is deliberately not prefixed NEXT_PUBLIC_, so Next will refuse
 * to inline it into the browser bundle. The anon key below is the only
 * credential the client ever receives, and it is safe there only because row
 * level security is enabled on every table.
 */
declare global {
  // eslint-disable-next-line no-var
  var __gigpullSql: ReturnType<typeof postgres> | undefined;
}

function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env.example");
  // Reused across hot reloads in development; without this each edit opens a
  // new pool and Supabase starts refusing connections.
  return (globalThis.__gigpullSql ??= postgres(url, { prepare: false, max: 5 }));
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

/**
 * Connects on first use, not at import time.
 *
 * `next build` imports every route module to collect metadata, so a
 * connection opened at module scope would make the build fail on any machine
 * without DATABASE_URL set — including CI, which has no database and does not
 * need one.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    instance ??= drizzle(connection(), { schema });
    return Reflect.get(instance, prop, receiver);
  },
});

export { schema };
