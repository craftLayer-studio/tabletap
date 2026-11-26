import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { growthSummary, ownerView } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const { restaurantId } = await requireStaff("owner:view");
    const [today, growth] = await Promise.all([ownerView(restaurantId), growthSummary(restaurantId)]);
    return { ...today, growth };
  });
}
