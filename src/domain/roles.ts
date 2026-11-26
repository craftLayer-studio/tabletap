import type { OrderStatus } from "./order";

export type StaffRole = "owner" | "manager" | "waiter" | "kitchen";

export const STAFF_ROLES: readonly StaffRole[] = ["owner", "manager", "waiter", "kitchen"];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  waiter: "Waiter",
  kitchen: "Kitchen",
};

/** Things a signed-in staff member can do. Checked on the server for every staff and owner action. */
export type Permission =
  | "floor:view"
  | "kitchen:view"
  | "requests:resolve"
  | "owner:view"
  | "menu:edit"
  | "tables:manage"
  | "customers:view"
  | "campaigns:send"
  | "settings:edit"
  | "demo:reset";

const PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: [
    "floor:view",
    "kitchen:view",
    "requests:resolve",
    "owner:view",
    "menu:edit",
    "tables:manage",
    "customers:view",
    "campaigns:send",
    "settings:edit",
    "demo:reset",
  ],
  manager: [
    "floor:view",
    "kitchen:view",
    "requests:resolve",
    "owner:view",
    "menu:edit",
    "tables:manage",
    "customers:view",
    "campaigns:send",
  ],
  waiter: ["floor:view", "kitchen:view", "requests:resolve"],
  kitchen: ["kitchen:view"],
};

export function can(role: StaffRole, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/**
 * Which roles may move an order into a status. Floor staff confirm, cancel and serve; the kitchen starts
 * cooking and marks ready. Owners and managers can do everything.
 */
const STATUS_ROLES: Record<Exclude<OrderStatus, "placed">, readonly StaffRole[]> = {
  confirmed: ["owner", "manager", "waiter"],
  cancelled: ["owner", "manager", "waiter"],
  served: ["owner", "manager", "waiter"],
  cooking: ["owner", "manager", "waiter", "kitchen"],
  ready: ["owner", "manager", "waiter", "kitchen"],
};

export function canSetStatus(role: StaffRole, to: OrderStatus): boolean {
  return to !== "placed" && STATUS_ROLES[to].includes(role);
}

/** Where a role lands after signing in. */
export function homeFor(role: StaffRole): string {
  if (role === "kitchen") return "/kitchen";
  if (role === "waiter") return "/staff";
  return "/owner";
}
