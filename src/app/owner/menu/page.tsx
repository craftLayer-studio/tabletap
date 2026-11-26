import type { Metadata } from "next";
import { MenuEditor } from "@/components/MenuEditor";
import { StaffBar } from "@/components/StaffBar";
import { pageStaff } from "@/server/session";

export const metadata: Metadata = { title: "Menu editor" };
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const staff = await pageStaff("menu:edit", "/owner/menu");
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner/menu" />
      <MenuEditor />
    </>
  );
}
