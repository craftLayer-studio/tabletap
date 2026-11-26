import { handle } from "@/server/http";
import { currentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const staff = await currentStaff();
    return staff ? { name: staff.name, role: staff.role } : { name: null, role: null };
  });
}
