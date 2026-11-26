import Link from "next/link";
import { can, ROLE_LABELS, type StaffRole } from "@/domain";
import { SignOutButton } from "./SignOutButton";

const LINKS: { href: string; label: string; show: (role: StaffRole) => boolean }[] = [
  { href: "/staff", label: "Floor", show: (r) => can(r, "floor:view") },
  { href: "/kitchen", label: "Kitchen", show: (r) => can(r, "kitchen:view") },
  { href: "/owner", label: "Today", show: (r) => can(r, "owner:view") },
  { href: "/owner/menu", label: "Menu", show: (r) => can(r, "menu:edit") },
  { href: "/owner/qr", label: "QR codes", show: (r) => can(r, "tables:manage") },
];

/** Signed-in staff member, the screens their role can open, and sign out. Rendered by each staff page. */
export function StaffBar({ name, role, current }: { name: string; role: StaffRole; current: string }) {
  return (
    <nav className="staff-bar" aria-label="Staff screens">
      <ul>
        {LINKS.filter((l) => l.show(role)).map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <span className="staff-bar__who">
        {name} · {ROLE_LABELS[role]}
      </span>
      <SignOutButton />
    </nav>
  );
}
