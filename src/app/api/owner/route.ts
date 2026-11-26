import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { ownerView } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ownerView((await requireStaff("owner:view")).restaurantId));
}
