import { handle, oneOf, readBody, str } from "@/server/http";
import { createRequest } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/tables/[tableId]/requests">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    return createRequest(tableId, str(body, "sessionId"), oneOf(body, "kind", ["waiter", "bill"] as const));
  });
}
