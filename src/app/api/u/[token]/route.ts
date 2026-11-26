import { handle, limit } from "@/server/http";
import { optOutByToken } from "@/server/store";

/** Opt out of marketing messages from the link in a message. */
export async function POST(request: Request, ctx: RouteContext<"/api/u/[token]">) {
  const { token } = await ctx.params;
  return handle(async () => {
    limit(request, "customer", "optout");
    return optOutByToken(token);
  });
}
