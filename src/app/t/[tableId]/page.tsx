import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestApp } from "@/components/GuestApp";
import { DEMO_TABLES } from "@/server/seed";

export const metadata: Metadata = { title: "Menu" };

export default async function TablePage({ params }: PageProps<"/t/[tableId]">) {
  const { tableId } = await params;
  if (!DEMO_TABLES.some((t) => t.id === tableId)) notFound();
  return <GuestApp tableId={tableId} />;
}
