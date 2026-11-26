import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { SettingsForm } from "@/components/SettingsForm";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";
import { getRestaurant } from "@/server/store";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await pageStaff("settings:edit", "/owner/settings");
  const restaurant = await getRestaurant(staff.restaurantId);
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner/settings" />
      <AppHeader title="Settings" subtitle={restaurant.name} />
      <main id="main" className="console owner-wide">
        <SettingsForm googleReviewUrl={restaurant.googleReviewUrl ?? ""} isDemo={restaurant.isDemo} />
      </main>
    </>
  );
}
