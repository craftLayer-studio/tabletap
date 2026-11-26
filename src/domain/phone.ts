/**
 * Indian mobile numbers in E.164 (+91 followed by 10 digits starting 6-9).
 * Accepts common ways people type them: "98765 43210", "+91-98765-43210", "098765 43210", "919876543210".
 */
export function normalizeIndianMobile(input: string): string | undefined {
  if (input.length > 20) return undefined;
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+91")) return undefined;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : undefined;
}

/** "+919876543210" -> "+91 98765 43210". */
export function formatIndianMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** "+919876543210" -> "+91 ●●●●● ●3210", for lists where the full number is not needed. */
export function maskPhone(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 3)} ●●●●● ●${e164.slice(-4)}` : e164;
}
