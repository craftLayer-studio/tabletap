import { ALLERGEN_LABELS, STATION_LABELS, type Allergen, type SpiceLevel, type Station } from "./menu";
import type { Paise } from "./money";

/** Parse a price typed in rupees ("320", "320.5", "₹1,250.00") into paise. */
export function parseRupees(input: string): Paise | undefined {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export const MAX_PRICE: Paise = 10_000_000; // ₹1,00,000
export const MAX_VARIANTS = 6;

export interface VariantInput {
  /** Existing variant id, kept so past orders and carts still match. Omit for a new size. */
  id?: string;
  name: string;
  price: Paise;
}

export interface MenuItemInput {
  categoryId: string;
  name: string;
  description: string;
  veg: boolean;
  spice: SpiceLevel;
  station: Station;
  prepMinutes: number;
  allergens: Allergen[];
  variants: VariantInput[];
  available: boolean;
  dealLabel?: string;
  dealPercentOff?: number;
}

/** Validate an owner's menu item edit. Returns a list of problems (empty when valid). */
export function validateMenuItem(input: MenuItemInput, categoryIds: string[]): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) errors.push("Name must be 2 to 80 characters");
  if (input.description.length > 300) errors.push("Description must be at most 300 characters");
  if (!categoryIds.includes(input.categoryId)) errors.push("Pick a category");
  if (![0, 1, 2, 3].includes(input.spice)) errors.push("Spice must be 0 to 3");
  if (!(input.station in STATION_LABELS)) errors.push("Pick a kitchen station");
  if (!Number.isInteger(input.prepMinutes) || input.prepMinutes < 1 || input.prepMinutes > 120) {
    errors.push("Prep time must be 1 to 120 minutes");
  }
  if (input.allergens.some((a) => !(a in ALLERGEN_LABELS))) errors.push("Unknown allergen");
  if (input.variants.length < 1 || input.variants.length > MAX_VARIANTS) {
    errors.push(`Give 1 to ${MAX_VARIANTS} sizes with prices`);
  }
  const names = new Set<string>();
  for (const v of input.variants) {
    const vn = v.name.trim().toLowerCase();
    if (vn.length < 1 || vn.length > 30) errors.push("Each size needs a name up to 30 characters");
    if (names.has(vn)) errors.push(`Size "${v.name}" is listed twice`);
    names.add(vn);
    if (!Number.isInteger(v.price) || v.price <= 0 || v.price > MAX_PRICE) errors.push(`Price for "${v.name}" is not valid`);
  }
  if (input.dealPercentOff !== undefined) {
    if (!Number.isInteger(input.dealPercentOff) || input.dealPercentOff < 1 || input.dealPercentOff > 90) {
      errors.push("Deal discount must be 1 to 90 percent");
    }
    if (!input.dealLabel?.trim()) errors.push("A deal needs a label guests can read");
  }
  return errors;
}

/** URL-friendly id from a name, e.g. "Paneer Tikka" -> "paneer-tikka". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}
