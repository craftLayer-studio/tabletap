import { handle, limit, oneOf, readBody, str } from "@/server/http";
import { createRequest, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/requests">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "request", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return createRequest(tableId, str(body, "sessionId"), oneOf(body, "kind", ["waiter", "bill"] as const));
  });
}
