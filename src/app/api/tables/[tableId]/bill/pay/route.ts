import { handle, num, oneOf, optStr, readBody, str } from "@/server/http";
import { payShare } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/tables/[tableId]/bill/pay">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    return payShare(tableId, str(body, "sessionId"), {
      partIndex: num(body, "partIndex"),
      method: oneOf(body, "method", ["upi", "card", "cash", "bank_transfer"] as const),
      receiptEmail: optStr(body, "receiptEmail", 254),
    });
  });
}
