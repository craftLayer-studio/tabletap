import type { NextRequest } from "next/server";
import { BadRequest, handle } from "@/server/http";
import { guestView, tableForToken } from "@/server/store";

export const dynamic = "force-dynamic";

/** Everything the guest page shows for one visit. The QR token picks the table; the session id is the capability. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/t/[token]">) {
  const { token } = await ctx.params;
  return handle(async () => {
    const sessionId = request.nextUrl.searchParams.get("session");
    if (!sessionId) throw new BadRequest("session is required");
    const { tableId } = await tableForToken(token);
    return guestView(tableId, sessionId);
  });
}
