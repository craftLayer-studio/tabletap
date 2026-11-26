import { handle, limit, readBody, str } from "@/server/http";
import { spinForVisit, tableForToken } from "@/server/store";

/** Spin the reward wheel: once per paid visit; the prize is a coupon for the next visit. */
export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/spin">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "game", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return spinForVisit(tableId, str(body, "sessionId"));
  });
}
