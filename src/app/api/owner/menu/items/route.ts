import { handle, readBody } from "@/server/http";
import { parseMenuItemInput } from "@/server/parse";
import { requireStaff } from "@/server/session";
import { addMenuItem } from "@/server/store";

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    return addMenuItem(staff.restaurantId, parseMenuItemInput(await readBody(request)));
  });
}
