import type { Allergen, Cart, MenuItemInput, SpiceLevel, Station } from "@/domain";
import { BadRequest } from "./http";

const MAX_LINES = 50;

/** Shape-check a cart from the client. Business rules (menu, qty limits) are applied by the domain. */
export function parseCart(value: unknown): Cart {
  if (!Array.isArray(value) || value.length > MAX_LINES) throw new BadRequest("cart must be a list of up to 50 lines");
  return value.map((line, i) => {
    if (typeof line !== "object" || line === null) throw new BadRequest(`cart line ${i + 1} is invalid`);
    const { itemId, variantId, qty, note } = line as Record<string, unknown>;
    if (typeof itemId !== "string" || typeof variantId !== "string" || typeof qty !== "number") {
      throw new BadRequest(`cart line ${i + 1} is invalid`);
    }
    if (note !== undefined && typeof note !== "string") throw new BadRequest(`cart line ${i + 1} note is invalid`);
    return { itemId, variantId, qty, note };
  });
}

/** Shape-check a menu item from the owner's editor. Business rules are applied by `validateMenuItem`. */
export function parseMenuItemInput(body: Record<string, unknown>): MenuItemInput {
  const text = (key: string, max: number, required = true) => {
    const v = body[key];
    if (v === undefined || v === null) {
      if (required) throw new BadRequest(`${key} is required`);
      return "";
    }
    if (typeof v !== "string" || v.length > max) throw new BadRequest(`${key} must be text up to ${max} characters`);
    return v;
  };
  const numberField = (key: string) => {
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequest(`${key} must be a number`);
    return v;
  };
  if (!Array.isArray(body.variants) || body.variants.length > 10) throw new BadRequest("variants must be a list");
  const variants = body.variants.map((v, i) => {
    if (typeof v !== "object" || v === null) throw new BadRequest(`size ${i + 1} is invalid`);
    const { id, name, price } = v as Record<string, unknown>;
    if (typeof name !== "string" || typeof price !== "number" || (id !== undefined && typeof id !== "string")) {
      throw new BadRequest(`size ${i + 1} is invalid`);
    }
    return { id: id as string | undefined, name: name.slice(0, 40), price };
  });
  if (!Array.isArray(body.allergens) || body.allergens.some((a) => typeof a !== "string")) {
    throw new BadRequest("allergens must be a list");
  }
  const dealPercentOff = body.dealPercentOff === undefined || body.dealPercentOff === null ? undefined : numberField("dealPercentOff");
  return {
    categoryId: text("categoryId", 80),
    name: text("name", 100),
    description: text("description", 400, false),
    veg: body.veg === true,
    spice: numberField("spice") as SpiceLevel,
    station: text("station", 20) as Station,
    prepMinutes: numberField("prepMinutes"),
    allergens: body.allergens as Allergen[],
    variants,
    available: body.available !== false,
    dealLabel: text("dealLabel", 60, false) || undefined,
    dealPercentOff,
  };
}
