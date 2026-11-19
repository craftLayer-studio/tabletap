import { handle, oneOf, readBody } from "@/server/http";
import { setOrderStatus } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[orderId]/status">) {
  const { orderId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    const to = oneOf(body, "to", ["confirmed", "cooking", "ready", "served", "cancelled"] as const);
    return setOrderStatus(orderId, to);
  });
}
