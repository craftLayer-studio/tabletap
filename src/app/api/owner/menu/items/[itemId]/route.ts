import { BadRequest, handle, readBody } from "@/server/http";
import { parseMenuItemInput } from "@/server/parse";
import { requireStaff } from "@/server/session";
import { deleteMenuItem, setItemAvailable, updateMenuItem } from "@/server/store";

type Ctx = RouteContext<"/api/owner/menu/items/[itemId]">;

/** Replace the dish: details, sizes and prices. */
export async function PUT(request: Request, ctx: Ctx) {
  const { itemId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    return updateMenuItem(staff.restaurantId, itemId, parseMenuItemInput(await readBody(request)));
  });
}

/** Quick availability toggle (sold out / back on). */
export async function PATCH(request: Request, ctx: Ctx) {
  const { itemId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    const body = await readBody(request);
    if (typeof body.available !== "boolean") throw new BadRequest("available must be true or false");
    await setItemAvailable(staff.restaurantId, itemId, body.available);
    return { ok: true };
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { itemId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    await deleteMenuItem(staff.restaurantId, itemId);
    return { ok: true };
  });
}
