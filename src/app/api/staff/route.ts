import { handle } from "@/server/http";
import { staffView } from "@/server/store";
import { DEMO_RESTAURANT } from "@/server/seed";

export const dynamic = "force-dynamic";

/** Floor map, active orders and open requests. Used by the staff and kitchen screens. */
export async function GET() {
  return handle(() => staffView(DEMO_RESTAURANT.id));
}
