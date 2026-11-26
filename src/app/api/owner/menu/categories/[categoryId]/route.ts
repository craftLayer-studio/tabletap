import { handle, int, optStr, readBody } from "@/server/http";
import { requireStaff } from "@/server/session";
import { deleteCategory, updateCategory } from "@/server/store";

type Ctx = RouteContext<"/api/owner/menu/categories/[categoryId]">;

export async function PATCH(request: Request, ctx: Ctx) {
  const { categoryId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    const body = await readBody(request);
    await updateCategory(staff.restaurantId, categoryId, {
      name: optStr(body, "name", 60),
      sortOrder: body.sortOrder === undefined ? undefined : int(body, "sortOrder"),
    });
    return { ok: true };
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { categoryId } = await ctx.params;
  return handle(async () => {
    const staff = await requireStaff("menu:edit");
    await deleteCategory(staff.restaurantId, categoryId);
    return { ok: true };
  });
}
