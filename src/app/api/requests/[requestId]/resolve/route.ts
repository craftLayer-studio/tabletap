import { handle } from "@/server/http";
import { resolveRequest } from "@/server/store";

export async function POST(_request: Request, ctx: RouteContext<"/api/requests/[requestId]/resolve">) {
  const { requestId } = await ctx.params;
  return handle(() => resolveRequest(requestId));
}
