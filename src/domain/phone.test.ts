import { describe, expect, it } from "vitest";
import { formatIndianMobile, maskPhone, normalizeIndianMobile } from "./phone";

describe("phone", () => {
  it("normalizes common Indian formats to E.164", () => {
    for (const v of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210"]) {
      expect(normalizeIndianMobile(v)).toBe("+919876543210");
    }
  });

  it("rejects landlines, short numbers and other countries", () => {
    for (const v of ["1234567890", "98765", "+14155550100", "abc", "5876543210"]) {
      expect(normalizeIndianMobile(v)).toBeUndefined();
    }
  });

  it("formats and masks", () => {
    expect(formatIndianMobile("+919876543210")).toBe("+91 98765 43210");
    expect(maskPhone("+919876543210")).toBe("+91 ●●●●● ●3210");
  });
});
