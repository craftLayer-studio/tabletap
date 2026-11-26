import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { rotateTableToken } from "@/server/store";

/** Issue a new QR token for a table; the old printed code stops working. */
export async function POST(_request: Request, ctx: RouteContext<"/api/owner/tables/[tableId]/rotate">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("tables:manage");
    await rotateTableToken(staff.restaurantId, tableId);
    return { ok: true };
  });
}
