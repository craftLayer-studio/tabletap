import type { Metadata } from "next";
import { formatIndianMobile, ROLE_LABELS } from "@/domain";
import { LoginApp } from "@/components/LoginApp";
import { DEMO_STAFF } from "@/server/seed";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;
  const denied = typeof sp.denied === "string";
  return (
    <LoginApp
      next={next}
      denied={denied}
      demoAccounts={DEMO_STAFF.map((u) => ({ name: u.name, role: ROLE_LABELS[u.role], phone: formatIndianMobile(u.phone) }))}
    />
  );
}
