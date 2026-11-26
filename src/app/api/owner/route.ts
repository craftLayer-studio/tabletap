import { handle } from "@/server/http";
import { ownerView } from "@/server/store";
import { DEMO_RESTAURANT } from "@/server/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => ownerView(DEMO_RESTAURANT.id));
}
