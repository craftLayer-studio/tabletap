import type { Metadata } from "next";
import { CustomersApp } from "@/components/CustomersApp";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await pageStaff("customers:view", "/owner/customers");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner/customers" />
      <CustomersApp />
    </>
  );
}
