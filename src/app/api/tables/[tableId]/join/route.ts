import { handle } from "@/server/http";
import { joinTable } from "@/server/store";

export async function POST(_request: Request, ctx: RouteContext<"/api/tables/[tableId]/join">) {
  const { tableId } = await ctx.params;
  return handle(async () => ({ sessionId: (await joinTable(tableId)).id }));
}
