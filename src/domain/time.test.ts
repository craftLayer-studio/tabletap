import { describe, expect, it } from "vitest";
import { startOfDay } from "./time";

describe("startOfDay", () => {
  it("returns IST midnight", () => {
    // 2026-11-19 10:00 IST = 04:30 UTC
    const now = Date.UTC(2026, 10, 19, 4, 30);
    expect(startOfDay(now)).toBe(Date.UTC(2026, 10, 18, 18, 30));
  });

  it("rolls over at IST midnight, not UTC midnight", () => {
    // 2026-11-19 00:10 IST = 2026-11-18 18:40 UTC
    const justAfter = Date.UTC(2026, 10, 18, 18, 40);
    expect(startOfDay(justAfter)).toBe(Date.UTC(2026, 10, 18, 18, 30));
    const justBefore = Date.UTC(2026, 10, 18, 18, 20);
    expect(startOfDay(justBefore)).toBe(Date.UTC(2026, 10, 17, 18, 30));
  });

  it("supports UTC", () => {
    expect(startOfDay(Date.UTC(2026, 0, 1, 12), 0)).toBe(Date.UTC(2026, 0, 1));
  });
});
