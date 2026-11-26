/**
 * Owner and manager use cases: tables and their QR tokens, and the menu editor.
 * Callers check the role first (see src/server/session.ts); every query here is scoped to the restaurant.
 */
import { and, asc, eq, max, sql } from "drizzle-orm";
import {
  slugify,
  validateMenuItem,
  type Menu,
  type MenuItem,
  type MenuItemInput,
} from "@/domain";
import { getDb, schema as s, type DbOrTx } from "../db/client";
import { StoreError } from "./errors";
import { insertMenuItem, loadMenu, newToken } from "./repo";

export interface TableWithToken {
  id: string;
  label: string;
  seats: number;
  qrToken: string;
}

/** The table a QR token points at. Unknown or rotated tokens are a 404. */
export async function tableForToken(token: string): Promise<{ tableId: string; restaurantId: string; label: string }> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new StoreError(404, "This QR code is not valid any more. Ask staff for help.");
  const db = await getDb();
  const [row] = await db
    .select({ id: s.tables.id, restaurantId: s.tables.restaurantId, label: s.tables.label })
    .from(s.tables)
    .where(and(eq(s.tables.qrToken, token), eq(s.tables.active, true)));
  if (!row) throw new StoreError(404, "This QR code is not valid any more. Ask staff for help.");
  return { tableId: row.id, restaurantId: row.restaurantId, label: row.label };
}

export async function listTablesWithTokens(restaurantId: string): Promise<TableWithToken[]> {
  const db = await getDb();
  return db
    .select({ id: s.tables.id, label: s.tables.label, seats: s.tables.seats, qrToken: s.tables.qrToken })
    .from(s.tables)
    .where(and(eq(s.tables.restaurantId, restaurantId), eq(s.tables.active, true)))
    .orderBy(asc(s.tables.sortOrder), asc(s.tables.label));
}

/** Issue a new random token for a table. The old printed QR stops working immediately. */
export async function rotateTableToken(restaurantId: string, tableId: string): Promise<TableWithToken> {
  const db = await getDb();
  const [row] = await db
    .update(s.tables)
    .set({ qrToken: newToken() })
    .where(and(eq(s.tables.id, tableId), eq(s.tables.restaurantId, restaurantId)))
    .returning({ id: s.tables.id, label: s.tables.label, seats: s.tables.seats, qrToken: s.tables.qrToken });
  if (!row) throw new StoreError(404, "Unknown table");
  return row;
}

export async function addTable(restaurantId: string, input: { label: string; seats: number }): Promise<TableWithToken> {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 12) throw new StoreError(400, "Table label must be 1 to 12 characters");
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 30) throw new StoreError(400, "Seats must be 1 to 30");
  const db = await getDb();
  const existing = await listTablesWithTokens(restaurantId);
  if (existing.some((t) => t.label.toLowerCase() === label.toLowerCase())) throw new StoreError(409, "A table with that label exists");
  const [{ top }] = await db
    .select({ top: max(s.tables.sortOrder) })
    .from(s.tables)
    .where(eq(s.tables.restaurantId, restaurantId));
  const id = `${restaurantId.slice(0, 12)}-${slugify(label)}-${newToken().slice(0, 6)}`;
  const [row] = await db
    .insert(s.tables)
    .values({ id, restaurantId, label, seats: input.seats, qrToken: newToken(), sortOrder: (top ?? 0) + 1 })
    .returning({ id: s.tables.id, label: s.tables.label, seats: s.tables.seats, qrToken: s.tables.qrToken });
  return row;
}

// Menu editor -----------------------------------------------------------------------------------------

export async function ownerMenu(restaurantId: string): Promise<Menu> {
  return loadMenu(await getDb(), restaurantId);
}

const uniqueId = (base: string) => `${base}-${newToken().slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;

export async function addCategory(restaurantId: string, name: string): Promise<{ id: string }> {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40) throw new StoreError(400, "Category name must be 2 to 40 characters");
  const db = await getDb();
  const [{ top }] = await db
    .select({ top: max(s.menuCategories.sortOrder) })
    .from(s.menuCategories)
    .where(eq(s.menuCategories.restaurantId, restaurantId));
  const id = uniqueId(slugify(clean));
  await db.insert(s.menuCategories).values({ id, restaurantId, name: clean, sortOrder: (top ?? 0) + 1 });
  return { id };
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  input: { name?: string; sortOrder?: number },
): Promise<void> {
  const patch: { name?: string; sortOrder?: number } = {};
  if (input.name !== undefined) {
    const clean = input.name.trim();
    if (clean.length < 2 || clean.length > 40) throw new StoreError(400, "Category name must be 2 to 40 characters");
    patch.name = clean;
  }
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || Math.abs(input.sortOrder) > 1000) throw new StoreError(400, "Bad sort order");
    patch.sortOrder = input.sortOrder;
  }
  if (Object.keys(patch).length === 0) return;
  const db = await getDb();
  const res = await db
    .update(s.menuCategories)
    .set(patch)
    .where(and(eq(s.menuCategories.id, categoryId), eq(s.menuCategories.restaurantId, restaurantId)))
    .returning({ id: s.menuCategories.id });
  if (res.length === 0) throw new StoreError(404, "Unknown category");
}

export async function deleteCategory(restaurantId: string, categoryId: string): Promise<void> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.menuItems)
    .where(and(eq(s.menuItems.categoryId, categoryId), eq(s.menuItems.restaurantId, restaurantId)));
  if (n > 0) throw new StoreError(409, "Move or delete the dishes in this category first");
  const res = await db
    .delete(s.menuCategories)
    .where(and(eq(s.menuCategories.id, categoryId), eq(s.menuCategories.restaurantId, restaurantId)))
    .returning({ id: s.menuCategories.id });
  if (res.length === 0) throw new StoreError(404, "Unknown category");
}

async function categoryIds(db: DbOrTx, restaurantId: string): Promise<string[]> {
  const rows = await db
    .select({ id: s.menuCategories.id })
    .from(s.menuCategories)
    .where(eq(s.menuCategories.restaurantId, restaurantId));
  return rows.map((r) => r.id);
}

function toItem(id: string, input: MenuItemInput, existing?: MenuItem): MenuItem {
  const used = new Set<string>();
  const variants = input.variants.map((v) => {
    // Keep ids of sizes that still exist so open carts keep working; new sizes get a slug id.
    let vid = v.id && existing?.variants.some((e) => e.id === v.id) ? v.id : slugify(v.name);
    while (used.has(vid)) vid = `${vid}-2`;
    used.add(vid);
    return { id: vid, name: v.name.trim(), price: v.price };
  });
  return {
    id,
    categoryId: input.categoryId,
    name: input.name.trim(),
    description: input.description.trim(),
    veg: input.veg,
    spice: input.spice,
    allergens: [...new Set(input.allergens)],
    variants,
    station: input.station,
    prepMinutes: input.prepMinutes,
    available: input.available,
    deal:
      input.dealPercentOff && input.dealLabel?.trim()
        ? { label: input.dealLabel.trim(), percentOff: input.dealPercentOff }
        : undefined,
  };
}

export async function addMenuItem(restaurantId: string, input: MenuItemInput): Promise<MenuItem> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const errors = validateMenuItem(input, await categoryIds(tx, restaurantId));
    if (errors.length) throw new StoreError(400, errors.join("; "));
    const item = toItem(uniqueId(slugify(input.name)), input);
    const [{ top }] = await tx
      .select({ top: max(s.menuItems.sortOrder) })
      .from(s.menuItems)
      .where(eq(s.menuItems.restaurantId, restaurantId));
    await insertMenuItem(tx, restaurantId, item, (top ?? 0) + 1);
    return item;
  });
}

/** Replace an item's details, sizes and prices. Past orders keep their snapshot prices. */
export async function updateMenuItem(restaurantId: string, itemId: string, input: MenuItemInput): Promise<MenuItem> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const menu = await loadMenu(tx, restaurantId);
    const existing = menu.items.find((i) => i.id === itemId);
    if (!existing) throw new StoreError(404, "Unknown dish");
    const errors = validateMenuItem(input, menu.categories.map((c) => c.id));
    if (errors.length) throw new StoreError(400, errors.join("; "));
    const item = toItem(itemId, input, existing);
    const [row] = await tx
      .select({ sortOrder: s.menuItems.sortOrder })
      .from(s.menuItems)
      .where(and(eq(s.menuItems.id, itemId), eq(s.menuItems.restaurantId, restaurantId)));
    await tx.delete(s.menuItems).where(and(eq(s.menuItems.id, itemId), eq(s.menuItems.restaurantId, restaurantId)));
    await insertMenuItem(tx, restaurantId, item, row.sortOrder);
    return item;
  });
}

export async function setItemAvailable(restaurantId: string, itemId: string, available: boolean): Promise<void> {
  const db = await getDb();
  const res = await db
    .update(s.menuItems)
    .set({ available })
    .where(and(eq(s.menuItems.id, itemId), eq(s.menuItems.restaurantId, restaurantId)))
    .returning({ id: s.menuItems.id });
  if (res.length === 0) throw new StoreError(404, "Unknown dish");
}

export async function deleteMenuItem(restaurantId: string, itemId: string): Promise<void> {
  const db = await getDb();
  const res = await db
    .delete(s.menuItems)
    .where(and(eq(s.menuItems.id, itemId), eq(s.menuItems.restaurantId, restaurantId)))
    .returning({ id: s.menuItems.id });
  if (res.length === 0) throw new StoreError(404, "Unknown dish");
}
