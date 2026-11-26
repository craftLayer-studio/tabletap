import { BadRequest, handle, readBody } from "@/server/http";
import { requireStaff } from "@/server/session";
import { updateSettings } from "@/server/store";

export async function PATCH(request: Request) {
  return handle(async () => {
    const staff = await requireStaff("settings:edit");
    const body = await readBody(request);
    const url = body.googleReviewUrl;
    if (url !== null && url !== undefined && typeof url !== "string") throw new BadRequest("googleReviewUrl must be text");
    await updateSettings(staff.restaurantId, { googleReviewUrl: url as string | null | undefined });
    return { ok: true };
  });
}
