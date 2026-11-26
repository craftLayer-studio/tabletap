import { homeFor } from "@/domain";
import { handle, limit, readBody, str } from "@/server/http";
import { startSession } from "@/server/session";
import { verifyOtp } from "@/server/store";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readBody(request);
    const phone = str(body, "phone", 20);
    limit(request, "otp", `verify:${phone}`);
    const staff = await verifyOtp(phone, str(body, "code", 6));
    await startSession(staff.id);
    return { name: staff.name, role: staff.role, home: homeFor(staff.role) };
  });
}
