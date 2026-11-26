import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { staffView } from "@/server/store";

export const dynamic = "force-dynamic";

/** Floor map, active orders and open requests. Used by the staff and kitchen screens. */
export async function GET() {
  return handle(async () => staffView((await requireStaff("kitchen:view")).restaurantId));
}
