import { handle, limit, readBody, str } from "@/server/http";
import { applyCoupon, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/coupon">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "coupon", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return applyCoupon(tableId, str(body, "sessionId"), str(body, "code", 20));
  });
}
