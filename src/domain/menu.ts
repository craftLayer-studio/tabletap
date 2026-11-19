import type { Paise } from "./money";

export type Allergen =
  | "gluten"
  | "dairy"
  | "nuts"
  | "peanuts"
  | "soy"
  | "egg"
  | "shellfish"
  | "fish"
  | "sesame"
  | "mustard";

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten",
  dairy: "Dairy",
  nuts: "Tree nuts",
  peanuts: "Peanuts",
  soy: "Soy",
  egg: "Egg",
  shellfish: "Shellfish",
  fish: "Fish",
  sesame: "Sesame",
  mustard: "Mustard",
};

/** 0 = not spicy, 3 = very spicy. */
export type SpiceLevel = 0 | 1 | 2 | 3;

export const SPICE_LABELS: Record<SpiceLevel, string> = {
  0: "Not spicy",
  1: "Mild",
  2: "Medium",
  3: "Hot",
};

/** Kitchen stations. Each menu item is cooked at exactly one station. */
export type Station = "tandoor" | "curry" | "grill" | "cold" | "bar";

export const STATION_LABELS: Record<Station, string> = {
  tandoor: "Tandoor",
  curry: "Curry & rice",
  grill: "Grill & fry",
  cold: "Cold & desserts",
  bar: "Drinks",
};

export interface Variant {
  id: string;
  /** e.g. "Half", "Full", "Regular". */
  name: string;
  price: Paise;
}

export interface Deal {
  /** Shown on the menu, e.g. "20% off before 7 pm". */
  label: string;
  /** Percent discount applied to every variant of the item. */
  percentOff: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  veg: boolean;
  spice: SpiceLevel;
  allergens: Allergen[];
  variants: Variant[];
  station: Station;
  /** Typical minutes from "cooking" to "ready". */
  prepMinutes: number;
  available: boolean;
  deal?: Deal;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Menu {
  categories: MenuCategory[];
  items: MenuItem[];
}

export function findItem(menu: Menu, itemId: string): MenuItem | undefined {
  return menu.items.find((i) => i.id === itemId);
}

export function findVariant(item: MenuItem, variantId: string): Variant | undefined {
  return item.variants.find((v) => v.id === variantId);
}

/** Price of one unit of a variant after the item's deal, if any. */
export function unitPrice(item: MenuItem, variant: Variant): Paise {
  if (!item.deal) return variant.price;
  const discount = Math.round((variant.price * item.deal.percentOff) / 100);
  return variant.price - discount;
}

/** Items grouped by category in category order; unavailable items are kept (shown as sold out). */
export function groupByCategory(menu: Menu): { category: MenuCategory; items: MenuItem[] }[] {
  return [...menu.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      category,
      items: menu.items.filter((i) => i.categoryId === category.id),
    }))
    .filter((group) => group.items.length > 0);
}

/** Items that contain none of the given allergens. */
export function excludeAllergens(items: MenuItem[], avoid: Allergen[]): MenuItem[] {
  return items.filter((i) => !i.allergens.some((a) => avoid.includes(a)));
}
