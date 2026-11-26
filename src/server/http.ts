import { StoreError } from "./store/errors";
import { GUEST_LIMITS, RateLimiter } from "./rate-limit";

/** Run a store call and turn the result or a StoreError into a JSON response. */
export async function handle(fn: () => unknown): Promise<Response> {
  try {
    return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StoreError || err instanceof BadRequest) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export class BadRequest extends Error {
  readonly status = 400;
}

const MAX_BODY_BYTES = 16_000;

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequest("Request too large");
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    throw new BadRequest("Body must be JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequest("Body must be a JSON object");
  return value as Record<string, unknown>;
}

export function str(body: Record<string, unknown>, key: string, max = 200): string {
  const v = body[key];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new BadRequest(`${key} is required`);
  return v;
}

export function optStr(body: Record<string, unknown>, key: string, max = 500): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.length > max) throw new BadRequest(`${key} must be text up to ${max} characters`);
  return v;
}

export function num(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequest(`${key} must be a number`);
  return v;
}

export function oneOf<T extends string>(body: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const v = body[key];
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new BadRequest(`${key} must be one of ${allowed.join(", ")}`);
  return v as T;
}

const g = globalThis as unknown as { __tabletapLimiter?: RateLimiter };
const limiter = (g.__tabletapLimiter ??= new RateLimiter());

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/** Rate-limit a public write per client IP and scope (usually the table token). Throws a 429. */
export function limit(request: Request, kind: keyof typeof GUEST_LIMITS, scope = ""): void {
  const result = limiter.hit(`${kind}:${clientIp(request)}:${scope}`, GUEST_LIMITS[kind]);
  if (!result.ok) throw new StoreError(429, `Too many requests. Try again in ${result.retryAfterSeconds} s.`);
}

export function bool(body: Record<string, unknown>, key: string): boolean {
  const v = body[key];
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw new BadRequest(`${key} must be true or false`);
  return v;
}

export function int(body: Record<string, unknown>, key: string): number {
  const v = num(body, key);
  if (!Number.isInteger(v)) throw new BadRequest(`${key} must be a whole number`);
  return v;
}
