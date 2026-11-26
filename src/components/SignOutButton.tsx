"use client";

import { useRouter } from "next/navigation";
import { postJson } from "@/lib/live";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        await postJson("/api/auth/logout").catch(() => undefined);
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
