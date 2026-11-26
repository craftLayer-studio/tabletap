import { handle } from "@/server/http";
import { endSession, requireStaff } from "@/server/session";
import { resetDemo, StoreError } from "@/server/store";
import { DEMO_RESTAURANT } from "@/server/seed";

/** Wipe the database and re-seed the demo restaurant. Owner of the demo restaurant only. */
export async function POST() {
  return handle(async () => {
    const staff = await requireStaff("demo:reset");
    if (staff.restaurantId !== DEMO_RESTAURANT.id) throw new StoreError(403, "Only the demo can be reset.");
    await resetDemo();
    await endSession();
    return { ok: true };
  });
}
