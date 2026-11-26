import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Database connection. Three modes:
 * - `DATABASE_URL` set: node-postgres pool against a real Postgres.
 * - tests (`VITEST`): in-memory PGlite, fresh per test worker.
 * - otherwise (dev, demo): PGlite file database at `./.data/pglite`.
 *
 * Migrations from `./drizzle` run on first use, and an empty database is seeded with the demo restaurant.
 * Both drivers share Drizzle's Postgres query API, so the store is written once against `Db`.
 */
export type Db = PgliteDatabase<typeof schema>;
/** A database handle or an open transaction; store helpers accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type Mode = "postgres" | "memory" | "file";

export function dbMode(): Mode {
  if (process.env.DATABASE_URL) return "postgres";
  if (process.env.VITEST || process.env.PGLITE_MEMORY === "1") return "memory";
  return "file";
}

async function connect(mode: Mode): Promise<{ db: Db; close: () => Promise<void> }> {
  if (mode === "postgres") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client: InstanceType<typeof PGlite>;
  if (mode === "file") {
    const dir = path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  } else {
    client = new PGlite();
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}

interface Holder {
  promise?: Promise<{ db: Db; close: () => Promise<void> }>;
}

// Keep one connection per process, surviving hot reloads in dev.
const holder = globalThis as unknown as { __tabletapDb?: Holder };
holder.__tabletapDb ??= {};

/** The shared database, connected, migrated and (if empty) seeded on first call. */
export async function getDb(): Promise<Db> {
  const h = holder.__tabletapDb!;
  if (!h.promise) {
    h.promise = (async () => {
      const conn = await connect(dbMode());
      if (dbMode() !== "memory") {
        const { seedIfEmpty } = await import("../seed-db");
        await seedIfEmpty(conn.db);
      }
      return conn;
    })();
    h.promise.catch(() => {
      h.promise = undefined;
    });
  }
  return (await h.promise).db;
}

/** Close the shared connection (scripts and tests). */
export async function closeDb(): Promise<void> {
  const h = holder.__tabletapDb!;
  if (!h.promise) return;
  const conn = await h.promise;
  h.promise = undefined;
  await conn.close();
}

export { schema };
