import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { resolveAlert } from "@/server/store";

export async function POST(_request: Request, ctx: RouteContext<"/api/owner/alerts/[alertId]/resolve">) {
  const { alertId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("owner:view");
    await resolveAlert(staff.restaurantId, alertId, staff.id);
    return { ok: true };
  });
}
