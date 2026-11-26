import type { Metadata } from "next";
import { KitchenApp } from "@/components/KitchenApp";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const staff = await pageStaff("kitchen:view", "/kitchen");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/kitchen" />
      <KitchenApp />
    </>
  );
}
