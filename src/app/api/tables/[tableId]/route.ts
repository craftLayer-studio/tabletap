import type { NextRequest } from "next/server";
import { BadRequest, handle } from "@/server/http";
import { guestView } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/tables/[tableId]">) {
  const { tableId } = await ctx.params;
  return handle(() => {
    const sessionId = request.nextUrl.searchParams.get("session");
    if (!sessionId) throw new BadRequest("session is required");
    return guestView(tableId, sessionId);
  });
}
