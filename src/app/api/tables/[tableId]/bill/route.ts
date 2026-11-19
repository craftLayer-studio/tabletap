import { handle, num, readBody, str } from "@/server/http";
import { prepareBill } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/tables/[tableId]/bill">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    return prepareBill(tableId, str(body, "sessionId"), {
      tipPercent: num(body, "tipPercent"),
      splitCount: num(body, "splitCount"),
    });
  });
}
