import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { resolveRequest } from "@/server/store";

export async function POST(_request: Request, ctx: RouteContext<"/api/requests/[requestId]/resolve">) {
  const { requestId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("requests:resolve");
    return resolveRequest(staff.restaurantId, requestId, Date.now(), staff.id);
  });
}
