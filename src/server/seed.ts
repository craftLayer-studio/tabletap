import type { Menu, Restaurant, Table } from "@/domain";

export type { Restaurant };

export const DEMO_RESTAURANT: Restaurant = {
  id: "juniper-kitchen",
  name: "Juniper Kitchen",
  city: "Pune",
  taxPercent: 5,
  upiVpa: "juniper.demo@example",
  isDemo: true,
};

/** Demo tables. QR tokens are generated randomly at seed time; ids are stable for tests. */
export const DEMO_TABLES: Table[] = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i + 1}`,
  restaurantId: DEMO_RESTAURANT.id,
  label: `T${i + 1}`,
  seats: i < 2 ? 2 : i < 5 ? 4 : 6,
}));

export const DEMO_MENU: Menu = {
  categories: [
    { id: "starters", name: "Starters", sortOrder: 1 },
    { id: "tandoor", name: "Tandoor & breads", sortOrder: 2 },
    { id: "mains", name: "Mains", sortOrder: 3 },
    { id: "rice", name: "Rice & biryani", sortOrder: 4 },
    { id: "desserts", name: "Desserts", sortOrder: 5 },
    { id: "drinks", name: "Drinks", sortOrder: 6 },
  ],
  items: [
    {
      id: "paneer-tikka",
      categoryId: "starters",
      name: "Paneer Tikka",
      description: "Cottage cheese cubes marinated in hung curd and spices, charred in the tandoor.",
      veg: true,
      spice: 2,
      allergens: ["dairy", "mustard"],
      variants: [
        { id: "half", name: "Half", price: 18000 },
        { id: "full", name: "Full", price: 32000 },
      ],
      station: "tandoor",
      prepMinutes: 14,
      available: true,
    },
    {
      id: "chicken-65",
      categoryId: "starters",
      name: "Chicken 65",
      description: "Crisp fried chicken tossed with curry leaves and green chilli.",
      veg: false,
      spice: 3,
      allergens: ["egg", "gluten"],
      variants: [
        { id: "half", name: "Half", price: 22000 },
        { id: "full", name: "Full", price: 38000 },
      ],
      station: "grill",
      prepMinutes: 12,
      available: true,
    },
    {
      id: "masala-peanuts",
      categoryId: "starters",
      name: "Masala Peanuts",
      description: "Roasted peanuts with onion, tomato, lime and chaat masala.",
      veg: true,
      spice: 1,
      allergens: ["peanuts"],
      variants: [{ id: "regular", name: "Regular", price: 12000 }],
      station: "cold",
      prepMinutes: 4,
      available: true,
      deal: { label: "Happy hour: 20% off", percentOff: 20 },
    },
    {
      id: "butter-naan",
      categoryId: "tandoor",
      name: "Butter Naan",
      description: "Leavened bread from the tandoor, brushed with butter.",
      veg: true,
      spice: 0,
      allergens: ["gluten", "dairy"],
      variants: [{ id: "regular", name: "Each", price: 6000 }],
      station: "tandoor",
      prepMinutes: 6,
      available: true,
    },
    {
      id: "tandoori-roti",
      categoryId: "tandoor",
      name: "Tandoori Roti",
      description: "Whole wheat bread from the tandoor.",
      veg: true,
      spice: 0,
      allergens: ["gluten"],
      variants: [{ id: "regular", name: "Each", price: 3500 }],
      station: "tandoor",
      prepMinutes: 5,
      available: true,
    },
    {
      id: "dal-makhani",
      categoryId: "mains",
      name: "Dal Makhani",
      description: "Black lentils slow-cooked overnight with butter and cream.",
      veg: true,
      spice: 1,
      allergens: ["dairy"],
      variants: [
        { id: "half", name: "Half", price: 19000 },
        { id: "full", name: "Full", price: 29000 },
      ],
      station: "curry",
      prepMinutes: 10,
      available: true,
    },
    {
      id: "butter-chicken",
      categoryId: "mains",
      name: "Butter Chicken",
      description: "Tandoori chicken in a tomato, butter and cashew gravy.",
      veg: false,
      spice: 1,
      allergens: ["dairy", "nuts"],
      variants: [
        { id: "half", name: "Half", price: 26000 },
        { id: "full", name: "Full", price: 42000 },
      ],
      station: "curry",
      prepMinutes: 16,
      available: true,
    },
    {
      id: "fish-curry",
      categoryId: "mains",
      name: "Goan Fish Curry",
      description: "Catch of the day in coconut and kokum gravy.",
      veg: false,
      spice: 2,
      allergens: ["fish", "mustard"],
      variants: [{ id: "regular", name: "Regular", price: 39000 }],
      station: "curry",
      prepMinutes: 18,
      available: false,
    },
    {
      id: "veg-biryani",
      categoryId: "rice",
      name: "Veg Dum Biryani",
      description: "Basmati rice and vegetables sealed and slow-cooked, served with raita.",
      veg: true,
      spice: 2,
      allergens: ["dairy", "nuts"],
      variants: [
        { id: "half", name: "Half", price: 21000 },
        { id: "full", name: "Full", price: 34000 },
      ],
      station: "curry",
      prepMinutes: 20,
      available: true,
    },
    {
      id: "jeera-rice",
      categoryId: "rice",
      name: "Jeera Rice",
      description: "Basmati tempered with cumin and ghee.",
      veg: true,
      spice: 0,
      allergens: ["dairy"],
      variants: [{ id: "regular", name: "Regular", price: 15000 }],
      station: "curry",
      prepMinutes: 8,
      available: true,
    },
    {
      id: "gulab-jamun",
      categoryId: "desserts",
      name: "Gulab Jamun",
      description: "Two warm milk dumplings in cardamom syrup.",
      veg: true,
      spice: 0,
      allergens: ["dairy", "gluten"],
      variants: [{ id: "regular", name: "2 pcs", price: 9000 }],
      station: "cold",
      prepMinutes: 3,
      available: true,
    },
    {
      id: "masala-chai",
      categoryId: "drinks",
      name: "Masala Chai",
      description: "Tea brewed with milk, ginger and cardamom.",
      veg: true,
      spice: 0,
      allergens: ["dairy"],
      variants: [{ id: "regular", name: "Cup", price: 5000 }],
      station: "bar",
      prepMinutes: 5,
      available: true,
    },
    {
      id: "fresh-lime-soda",
      categoryId: "drinks",
      name: "Fresh Lime Soda",
      description: "Sweet, salted or mixed.",
      veg: true,
      spice: 0,
      allergens: [],
      variants: [{ id: "regular", name: "Glass", price: 8000 }],
      station: "bar",
      prepMinutes: 3,
      available: true,
      deal: { label: "2nd glass half price (shown as 25% off)", percentOff: 25 },
    },
  ],
};

/** Demo staff. Phone numbers use the 98000 0000x range and are made up; sign in with the code shown on screen. */
export const DEMO_STAFF = [
  { id: "staff-owner", name: "Ananya Rao", phone: "+919800000001", role: "owner" },
  { id: "staff-manager", name: "Vikram Joshi", phone: "+919800000002", role: "manager" },
  { id: "staff-waiter", name: "Ravi Kumar", phone: "+919800000003", role: "waiter" },
  { id: "staff-kitchen", name: "Imran Shaikh", phone: "+919800000004", role: "kitchen" },
] as const;

/** Clearly fake placeholder for the review funnel; owners paste their own Google review link in Settings. */
export const DEMO_GOOGLE_REVIEW_URL = "https://example.com/demo-google-review-link";

/**
 * Made-up demo diners (phone numbers in the unused-looking 99990 000xx range). Visit history drives the CRM
 * segments: Priya and Arjun are regulars, Rahul and Kavya lapsed, Sneha new.
 */
export const DEMO_CUSTOMERS: {
  name: string;
  phone: string;
  visitsDaysAgo: number[];
  service: boolean;
  marketing: boolean;
  redeemsCampaignDaysAgo?: number;
  lowRatingDaysAgo?: number;
}[] = [
  { name: "Priya Sharma", phone: "+919999000001", visitsDaysAgo: [25, 12, 3], service: true, marketing: true },
  { name: "Rahul Verma", phone: "+919999000002", visitsDaysAgo: [60, 45], service: false, marketing: true },
  { name: "Sneha Iyer", phone: "+919999000003", visitsDaysAgo: [5], service: true, marketing: false, lowRatingDaysAgo: 5 },
  { name: "Arjun Mehta", phone: "+919999000004", visitsDaysAgo: [40, 20, 8, 2], service: true, marketing: true, redeemsCampaignDaysAgo: 8 },
  { name: "Kavya Nair", phone: "+919999000005", visitsDaysAgo: [50], service: false, marketing: true },
];
