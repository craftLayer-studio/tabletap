/**
 * Database commands. Uses DATABASE_URL when set, otherwise the PGlite file database in ./.data/pglite.
 *   pnpm db:migrate  apply migrations (and seed an empty database)
 *   pnpm db:seed     seed the demo restaurant if the database is empty
 *   pnpm db:reset    wipe all data and seed the demo again
 * Stop the dev server first: a PGlite file database can be opened by one process at a time.
 */
import { closeDb, getDb } from "../src/server/db/client";
import { seedDemo, seedIfEmpty, wipe } from "../src/server/seed-db";

async function main() {
  const cmd = process.argv[2];
  const db = await getDb(); // connects, migrates and seeds an empty database
  if (cmd === "seed") {
    const seeded = await seedIfEmpty(db);
    console.info(seeded ? "Seeded." : "Database already has data; use db:reset to start over.");
  } else if (cmd === "reset") {
    await db.transaction(async (tx) => {
      await wipe(tx);
      await seedDemo(tx);
    });
    console.info("Wiped and re-seeded the demo restaurant.");
  } else if (cmd !== "migrate") {
    throw new Error(`Unknown command ${cmd}`);
  }
  console.info("Migrations are up to date.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
