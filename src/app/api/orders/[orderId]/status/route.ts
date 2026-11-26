import { canSetStatus } from "@/domain";
import { handle, oneOf, readBody } from "@/server/http";
import { requireStaff } from "@/server/session";
import { setOrderStatus, StoreError } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[orderId]/status">) {
  const { orderId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("kitchen:view");
    const body = await readBody(request);
    const to = oneOf(body, "to", ["confirmed", "cooking", "ready", "served", "cancelled"] as const);
    if (!canSetStatus(staff.role, to)) throw new StoreError(403, "Your role cannot make that change.");
    return setOrderStatus(staff.restaurantId, orderId, to, Date.now(), staff.id);
  });
}
