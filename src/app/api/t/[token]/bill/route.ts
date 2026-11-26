import { handle, limit, num, readBody, str } from "@/server/http";
import { prepareBill, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/bill">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "bill", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return prepareBill(tableId, str(body, "sessionId"), {
      tipPercent: num(body, "tipPercent"),
      splitCount: num(body, "splitCount"),
    });
  });
}
