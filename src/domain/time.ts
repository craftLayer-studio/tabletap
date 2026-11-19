/** India Standard Time is UTC+5:30 all year (no daylight saving). */
export const IST_OFFSET_MINUTES = 330;
const DAY_MS = 86_400_000;

/** Epoch ms of the most recent midnight in a fixed-offset time zone (default IST). */
export function startOfDay(now: number, offsetMinutes = IST_OFFSET_MINUTES): number {
  const offsetMs = offsetMinutes * 60_000;
  return Math.floor((now + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
}
