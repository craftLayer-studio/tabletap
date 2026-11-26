import { bool, handle, limit, optStr, readBody, str } from "@/server/http";
import { captureCustomer, tableForToken } from "@/server/store";

/** Guest shares a phone number, with one separate, unticked-by-default opt-in per purpose. */
export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/customer">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "customer", token);
    const body = await readBody(request);
    const { tableId } = await tableForToken(token);
    await captureCustomer(tableId, str(body, "sessionId"), {
      phone: str(body, "phone", 20),
      name: optStr(body, "name", 60),
      consentService: bool(body, "consentService"),
      consentMarketing: bool(body, "consentMarketing"),
    });
    return { ok: true };
  });
}
