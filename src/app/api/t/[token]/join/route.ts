import { handle, limit } from "@/server/http";
import { joinTable, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/join">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "join", token);
    const { tableId } = await tableForToken(token);
    return { sessionId: (await joinTable(tableId)).id };
  });
}
