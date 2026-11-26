import { describe, expect, it } from "vitest";
import { can, canSetStatus, homeFor } from "./roles";

describe("roles", () => {
  it("lets only owners and managers into the owner area", () => {
    expect(can("owner", "menu:edit")).toBe(true);
    expect(can("manager", "campaigns:send")).toBe(true);
    expect(can("waiter", "owner:view")).toBe(false);
    expect(can("kitchen", "floor:view")).toBe(false);
    expect(can("manager", "demo:reset")).toBe(false);
  });

  it("splits order transitions between floor and kitchen", () => {
    expect(canSetStatus("waiter", "confirmed")).toBe(true);
    expect(canSetStatus("kitchen", "confirmed")).toBe(false);
    expect(canSetStatus("kitchen", "cancelled")).toBe(false);
    expect(canSetStatus("kitchen", "ready")).toBe(true);
    expect(canSetStatus("owner", "placed")).toBe(false);
  });

  it("sends each role to its screen", () => {
    expect(homeFor("kitchen")).toBe("/kitchen");
    expect(homeFor("waiter")).toBe("/staff");
    expect(homeFor("manager")).toBe("/owner");
  });
});
