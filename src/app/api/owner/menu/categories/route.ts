import { handle, readBody, str } from "@/server/http";
import { requireStaff } from "@/server/session";
import { addCategory } from "@/server/store";

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    const body = await readBody(request);
    return addCategory(staff.restaurantId, str(body, "name", 60));
  });
}
