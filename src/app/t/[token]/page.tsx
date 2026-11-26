import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestApp } from "@/components/GuestApp";
import { tableForToken } from "@/server/store";

export const metadata: Metadata = { title: "Menu", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TablePage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  try {
    await tableForToken(token);
  } catch {
    notFound();
  }
  return <GuestApp token={token} />;
}
