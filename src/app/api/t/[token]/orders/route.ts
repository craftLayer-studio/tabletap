import { handle, limit, readBody, str } from "@/server/http";
import { parseCart } from "@/server/parse";
import { placeOrder, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/orders">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "order", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return placeOrder(tableId, str(body, "sessionId"), parseCart(body.cart));
  });
}
