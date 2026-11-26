import { handle } from "@/server/http";
import { requireStaff } from "@/server/session";
import { listCustomers } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const { restaurantId } = await requireStaff("customers:view");
    // The opt-out token is a capability for the guest; it never leaves the server in owner views.
    const customers = (await listCustomers(restaurantId)).map((c) => ({ ...c, optOutToken: undefined }));
    return { customers, now: Date.now() };
  });
}
