import type { Metadata } from "next";
import { OwnerApp } from "@/components/OwnerApp";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Owner" };
export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const staff = await pageStaff("owner:view", "/owner");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner" />
      <OwnerApp canReset={staff.role === "owner"} />
    </>
  );
}
