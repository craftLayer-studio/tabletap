import { parseRating } from "@/domain";
import { BadRequest, handle, limit, optStr, readBody, str } from "@/server/http";
import { addReview, tableForToken } from "@/server/store";

export async function POST(request: Request, ctx: RouteContext<"/api/t/[token]/review">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "review", token);
    const body = await readBody(request);
    const rating = parseRating(body.rating);
    if (!rating) throw new BadRequest("rating must be a whole number from 1 to 5");
    const { tableId } = await tableForToken(token);
    return addReview(tableId, str(body, "sessionId"), { rating, comment: optStr(body, "comment", 500) });
  });
}
