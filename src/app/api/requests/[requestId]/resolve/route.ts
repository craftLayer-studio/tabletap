import { handle } from "@/server/http";
import { resolveRequest } from "@/server/store";
import { DEMO_RESTAURANT } from "@/server/seed";

export async function POST(_request: Request, ctx: RouteContext<"/api/requests/[requestId]/resolve">) {
  const { requestId } = await ctx.params;
  return handle(() => resolveRequest(DEMO_RESTAURANT.id, requestId));
}
