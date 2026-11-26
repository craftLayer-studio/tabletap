import type { Metadata } from "next";
import { StaffApp } from "@/components/StaffApp";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await pageStaff("floor:view", "/staff");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/staff" />
      <StaffApp />
    </>
  );
}
