import { handle, limit, num, oneOf, optStr, readBody, str } from "@/server/http";
import { payShare, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/bill/pay">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "pay", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    return payShare(tableId, str(body, "sessionId"), {
      partIndex: num(body, "partIndex"),
      method: oneOf(body, "method", ["upi", "card", "cash", "bank_transfer"] as const),
      receiptEmail: optStr(body, "receiptEmail", 254),
    });
  });
}
