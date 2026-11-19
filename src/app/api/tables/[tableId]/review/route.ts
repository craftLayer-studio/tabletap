import { parseRating } from "@/domain";
import { BadRequest, handle, optStr, readBody, str } from "@/server/http";
import { addReview } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/tables/[tableId]/review">) {
  const { tableId } = await ctx.params;
  return handle(async () => {
    const body = await readBody(request);
    const rating = parseRating(body.rating);
    if (!rating) throw new BadRequest("rating must be a whole number from 1 to 5");
    return addReview(tableId, str(body, "sessionId"), { rating, comment: optStr(body, "comment", 500) });
  });
}
