import { handle, int, oneOf, optStr, readBody } from "@/server/http";
import { appUrl } from "@/server/app-url";
import { requireStaff } from "@/server/session";
import { campaignResults, listCustomers, listOutbox, sendCampaign } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const { restaurantId } = await requireStaff("campaigns:send");
    const [results, outbox, customers] = await Promise.all([campaignResults(restaurantId), listOutbox(restaurantId), listCustomers(restaurantId)]);
    const reachable = { all: 0, new: 0, regular: 0, lapsed: 0 };
    for (const c of customers) {
      if (!c.consent.marketing) continue;
      reachable.all += 1;
      reachable[c.segment] += 1;
    }
    return { results, outbox, reachable, now: Date.now() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff("campaigns:send");
    const body = await readBody(request);
    return sendCampaign(
      staff.restaurantId,
      staff.id,
      {
        template: oneOf(body, "template", ["winback", "weekday", "new_dish", "event"] as const),
        audience: oneOf(body, "audience", ["all", "new", "regular", "lapsed"] as const),
        offerKind: oneOf(body, "offerKind", ["percent", "flat"] as const),
        offerValue: int(body, "offerValue"),
        detail: optStr(body, "detail", 120),
      },
      await appUrl(),
    );
  });
}
