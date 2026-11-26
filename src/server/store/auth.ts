/**
 * Staff sign-in with phone + one-time code. Codes are stored hashed, expire after 5 minutes and allow
 * 5 attempts. In demo mode the code is returned to the caller so the login screen can show it; a real
 * SMS adapter replaces that before production.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { normalizeIndianMobile, type StaffRole } from "@/domain";
import { getDb, schema as s } from "../db/client";
import { StoreError } from "./errors";
import { newId, toDate } from "./repo";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export interface StaffUser {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  role: StaffRole;
}

export function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  const g = globalThis as unknown as { __tabletapSecretWarned?: boolean };
  if (!g.__tabletapSecretWarned && !process.env.VITEST) {
    console.warn("[auth] SESSION_SECRET is not set; using an insecure development secret.");
    g.__tabletapSecretWarned = true;
  }
  return "tabletap-dev-secret-do-not-use-in-production";
}

const hashCode = (phone: string, code: string) => createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");

export function demoOtpEnabled(): boolean {
  return process.env.DEMO_OTP !== "off";
}

/**
 * Start a sign-in. Always answers the same way whether or not the number belongs to staff, so the endpoint
 * does not reveal who works where; `demoCode` is only present for a known number in demo mode.
 */
export async function requestOtp(phoneInput: string, now = Date.now()): Promise<{ phone: string; demoCode?: string }> {
  const phone = normalizeIndianMobile(phoneInput);
  if (!phone) throw new StoreError(400, "Enter a 10-digit Indian mobile number.");
  const db = await getDb();
  const [staff] = await db
    .select({ id: s.staffUsers.id })
    .from(s.staffUsers)
    .where(and(eq(s.staffUsers.phone, phone), eq(s.staffUsers.active, true)));
  if (!staff) return { phone };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(s.otpChallenges).values({
    id: newId("otp"),
    phone,
    codeHash: hashCode(phone, code),
    expiresAt: toDate(now + OTP_TTL_MS),
    createdAt: toDate(now),
  });
  return { phone, demoCode: demoOtpEnabled() ? code : undefined };
}

/** Check a code and return the staff member it signs in. */
export async function verifyOtp(phoneInput: string, code: string, now = Date.now()): Promise<StaffUser> {
  const phone = normalizeIndianMobile(phoneInput);
  if (!phone || !/^\d{6}$/.test(code)) throw new StoreError(400, "Enter the 6-digit code.");
  const db = await getDb();
  const [challenge] = await db
    .select()
    .from(s.otpChallenges)
    .where(
      and(eq(s.otpChallenges.phone, phone), isNull(s.otpChallenges.consumedAt), gt(s.otpChallenges.expiresAt, toDate(now))),
    )
    .orderBy(desc(s.otpChallenges.createdAt))
    .limit(1);
  const invalid = new StoreError(401, "That code is wrong or has expired. Ask for a new one.");
  if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw invalid;
  const expected = Buffer.from(challenge.codeHash, "hex");
  const given = Buffer.from(hashCode(phone, code), "hex");
  if (!timingSafeEqual(expected, given)) {
    await db.update(s.otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(s.otpChallenges.id, challenge.id));
    throw invalid;
  }
  await db.update(s.otpChallenges).set({ consumedAt: toDate(now) }).where(eq(s.otpChallenges.id, challenge.id));
  const [staff] = await db
    .select()
    .from(s.staffUsers)
    .where(and(eq(s.staffUsers.phone, phone), eq(s.staffUsers.active, true)))
    .limit(1);
  if (!staff) throw invalid;
  return { id: staff.id, restaurantId: staff.restaurantId, name: staff.name, phone: staff.phone, role: staff.role };
}

/** Load an active staff member by id (each request re-checks, so a removed account stops working at once). */
export async function getStaffUser(staffId: string): Promise<StaffUser | undefined> {
  const db = await getDb();
  const [staff] = await db
    .select()
    .from(s.staffUsers)
    .where(and(eq(s.staffUsers.id, staffId), eq(s.staffUsers.active, true)));
  return staff
    ? { id: staff.id, restaurantId: staff.restaurantId, name: staff.name, phone: staff.phone, role: staff.role }
    : undefined;
}

export async function listStaff(restaurantId: string): Promise<StaffUser[]> {
  const db = await getDb();
  const rows = await db.select().from(s.staffUsers).where(eq(s.staffUsers.restaurantId, restaurantId));
  return rows.map((r) => ({ id: r.id, restaurantId: r.restaurantId, name: r.name, phone: r.phone, role: r.role }));
}

/** Signed session token: base64url(JSON payload) + "." + HMAC. */
export function signSession(staffId: string, now = Date.now(), ttlMs = 12 * 3600_000): string {
  const payload = Buffer.from(JSON.stringify({ sid: staffId, exp: now + ttlMs })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifySession(token: string | undefined, now = Date.now()): string | undefined {
  if (!token) return undefined;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return undefined;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sid?: unknown; exp?: unknown };
    if (typeof data.sid !== "string" || typeof data.exp !== "number" || data.exp < now) return undefined;
    return data.sid;
  } catch {
    return undefined;
  }
}
