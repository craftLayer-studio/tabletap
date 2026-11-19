import type { Metadata } from "next";
import { KitchenApp } from "@/components/KitchenApp";

export const metadata: Metadata = { title: "Kitchen" };

export default function KitchenPage() {
  return <KitchenApp />;
}
