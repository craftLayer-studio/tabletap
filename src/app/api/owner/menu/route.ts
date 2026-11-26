import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { ownerMenu } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ menu: await ownerMenu((await requireStaff("menu:edit")).restaurantId), now: Date.now() }));
}
