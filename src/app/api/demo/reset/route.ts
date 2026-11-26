import { handle } from "@/server/http";
import { resetDemo } from "@/server/store";

/** Wipe the database and re-seed the demo restaurant. */
export async function POST() {
  return handle(async () => {
    await resetDemo();
    return { ok: true };
  });
}
