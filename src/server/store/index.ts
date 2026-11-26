/**
 * The store: data access and use cases on Postgres (Drizzle). Route handlers call these functions only.
 * See src/server/db for the schema and connection.
 */
import { getDb } from "../db/client";
import { seedDemo, wipe } from "../seed-db";

export { StoreError } from "./errors";
export * from "./table-service";

/** Wipe everything and seed the demo restaurant again. Used by tests and the owner's "reset demo" button. */
export async function resetDemo(now = Date.now()): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await wipe(tx);
    await seedDemo(tx, now);
  });
}
export * from "./admin";
export * from "./auth";
export * from "./growth";
