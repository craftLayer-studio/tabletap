import type { Cart } from "@/domain";
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
