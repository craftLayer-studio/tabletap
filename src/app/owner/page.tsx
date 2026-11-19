import type { Metadata } from "next";
import { OwnerApp } from "@/components/OwnerApp";

export const metadata: Metadata = { title: "Owner" };

export default function OwnerPage() {
  return <OwnerApp />;
}
