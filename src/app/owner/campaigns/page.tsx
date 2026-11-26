import type { Metadata } from "next";
import { CampaignsApp } from "@/components/CampaignsApp";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await pageStaff("campaigns:send", "/owner/campaigns");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner/campaigns" />
      <CampaignsApp />
    </>
  );
}
