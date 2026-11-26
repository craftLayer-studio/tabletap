/**
 * Staff session cookie (httpOnly, signed) and role checks for route handlers and pages.
 * The cookie only names the staff member; their role and restaurant are re-read from the database on every request.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/domain";
import { getStaffUser, signSession, StoreError, verifySession, type StaffUser } from "./store";

export const SESSION_COOKIE = "tt_staff";
const TTL_SECONDS = 12 * 3600;

export async function currentStaff(): Promise<StaffUser | undefined> {
  const jar = await cookies();
  const staffId = verifySession(jar.get(SESSION_COOKIE)?.value);
  return staffId ? getStaffUser(staffId) : undefined;
}

/** For route handlers: the signed-in staff member, or a 401/403 StoreError. */
export async function requireStaff(permission: Permission): Promise<StaffUser> {
  const staff = await currentStaff();
  if (!staff) throw new StoreError(401, "Please sign in again.");
  if (!can(staff.role, permission)) throw new StoreError(403, "Your role cannot do that.");
  return staff;
}

/** For pages: the signed-in staff member, or a redirect to the login page (or the right home screen). */
export async function pageStaff(permission: Permission, path: string): Promise<StaffUser> {
  const staff = await currentStaff();
  if (!staff) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!can(staff.role, permission)) redirect(`/login?denied=${encodeURIComponent(path)}`);
  return staff;
}

export async function startSession(staffId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(staffId, Date.now(), TTL_SECONDS * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !(process.env.APP_URL ?? "").startsWith("http://"),
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
