import { headers } from "next/headers";

/**
 * Public base URL for QR codes and share links. APP_URL wins (production: https://dineloop.craftlayer.store);
 * otherwise the request's own host, so a dev server on http://localhost:31NN prints codes that work locally.
 */
export async function appUrl(): Promise<string> {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
