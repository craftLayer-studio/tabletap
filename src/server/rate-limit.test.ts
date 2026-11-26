import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to max hits per window, then blocks until the window slides", () => {
    const rl = new RateLimiter();
    const limit = { max: 3, windowMs: 1000 };
    expect(rl.hit("k", limit, 0).ok).toBe(true);
    expect(rl.hit("k", limit, 100).ok).toBe(true);
    expect(rl.hit("k", limit, 200).ok).toBe(true);
    const blocked = rl.hit("k", limit, 300);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(rl.hit("other", limit, 300).ok).toBe(true);
    expect(rl.hit("k", limit, 1001).ok).toBe(true);
  });

  it("caps memory by pruning old keys", () => {
    const rl = new RateLimiter(5);
    for (let i = 0; i < 20; i++) rl.hit(`k${i}`, { max: 1, windowMs: 10 }, i * 100);
    expect(rl.hit("k19", { max: 1, windowMs: 10 }, 1900).ok).toBe(false);
  });
});
