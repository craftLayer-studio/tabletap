import type { Metadata } from "next";
import { StaffApp } from "@/components/StaffApp";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return <StaffApp />;
}
