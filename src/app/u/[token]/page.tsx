import type { Metadata } from "next";
import { OptOut } from "@/components/OptOut";

export const metadata: Metadata = { title: "Stop offers", robots: { index: false } };

/** Opt-out page linked from every marketing message. The button (a POST) does the work, so link previews cannot. */
export default async function OptOutPage({ params }: PageProps<"/u/[token]">) {
  const { token } = await params;
  return <OptOut token={token} />;
}
