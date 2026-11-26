import { handle, limit, readBody, str } from "@/server/http";
import { requestOtp } from "@/server/store";

/** Send a sign-in code. In demo mode the code comes back in the response so the screen can show it. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readBody(request);
    const phone = str(body, "phone", 20);
    limit(request, "otp", phone);
    const { demoCode } = await requestOtp(phone);
    return { sent: true, demoCode };
  });
}
