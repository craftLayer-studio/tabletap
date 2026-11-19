import { handle, readBody, str } from "@/server/http";
import { parseCart } from "@/server/parse";
import { placeOrder } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/tables/[tableId]/orders">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    return placeOrder(tableId, str(body, "sessionId"), parseCart(body.cart));
  });
}
