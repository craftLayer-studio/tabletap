import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./drizzle from the schema. Run `pnpm db:generate` after changing the schema.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
