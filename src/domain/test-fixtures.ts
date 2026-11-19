import type { Menu } from "./menu";

/** Small menu used only by unit tests. */
export const testMenu: Menu = {
  categories: [
    { id: "mains", name: "Mains", sortOrder: 2 },
    { id: "starters", name: "Starters", sortOrder: 1 },
    { id: "empty", name: "Empty", sortOrder: 3 },
  ],
  items: [
    {
      id: "paneer-tikka",
      categoryId: "starters",
      name: "Paneer Tikka",
      description: "",
      veg: true,
      spice: 2,
      allergens: ["dairy"],
      variants: [
        { id: "half", name: "Half", price: 18000 },
        { id: "full", name: "Full", price: 32000 },
      ],
      station: "tandoor",
      prepMinutes: 15,
      available: true,
    },
    {
      id: "dal",
      categoryId: "mains",
      name: "Dal Tadka",
      description: "",
      veg: true,
      spice: 1,
      allergens: [],
      variants: [{ id: "regular", name: "Regular", price: 22000 }],
      station: "curry",
      prepMinutes: 10,
      available: true,
      deal: { label: "10% off", percentOff: 10 },
    },
    {
      id: "fish",
      categoryId: "mains",
      name: "Fish Curry",
      description: "",
      veg: false,
      spice: 3,
      allergens: ["fish", "mustard"],
      variants: [{ id: "regular", name: "Regular", price: 39900 }],
      station: "curry",
      prepMinutes: 20,
      available: false,
    },
  ],
};
