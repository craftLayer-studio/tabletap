import { handle, oneOf, readBody } from "@/server/http";
import { requireStaff } from "@/server/session";
import { withdrawConsent } from "@/server/store";

/** Record that a customer withdrew consent (replied STOP, asked staff). */
export async function POST(request: Request, ctx: RouteContext<"/api/owner/customers/[customerId]/withdraw">) {
  const { customerId } = await ctx.params;
  return handle(async () => {
    const { restaurantId } = await requireStaff("customers:view");
    const body = await readBody(request);
    await withdrawConsent(restaurantId, customerId, oneOf(body, "purpose", ["service", "marketing"] as const), "whatsapp");
    return { ok: true };
  });
}
