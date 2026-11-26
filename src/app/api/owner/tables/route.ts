import { handle, int, readBody, str } from "@/server/http";
import { requireStaff } from "@/server/session";
import { addTable } from "@/server/store";

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff("tables:manage");
    const body = await readBody(request);
    return addTable(staff.restaurantId, { label: str(body, "label", 20), seats: int(body, "seats") });
  });
}
