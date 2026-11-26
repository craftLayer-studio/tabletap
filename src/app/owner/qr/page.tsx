import type { Metadata } from "next";
import QRCode from "qrcode";
import { StaffBar } from "@/components/StaffBar";
import { QrTools } from "@/components/QrTools";
import { appUrl } from "@/server/app-url";
import { pageStaff } from "@/server/session";
import { getRestaurant, listTablesWithTokens } from "@/server/store";

export const metadata: Metadata = { title: "QR codes" };
export const dynamic = "force-dynamic";

/** Printable sheet: one QR code per table. Print from the browser; the staff bar and buttons are hidden in print. */
export default async function QrSheetPage() {
  const staff = await pageStaff("tables:manage", "/owner/qr");
  const [restaurant, tables, base] = await Promise.all([
    getRestaurant(staff.restaurantId),
    listTablesWithTokens(staff.restaurantId),
    appUrl(),
  ]);
  const codes = await Promise.all(
    tables.map(async (t) => {
      const url = `${base}/t/${t.qrToken}`;
      const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
      return { ...t, url, svg };
    }),
  );
  return (
    <>
      <StaffBar name={staff.name} role={staff.role} current="/owner/qr" />
      <main id="main" className="console qr-page">
        <header className="qr-page__head no-print">
          <h1>Table QR codes</h1>
          <p className="muted">
            Print this page and place each code on its table. Codes point to {base}. Re-issuing a code stops the old
            printed one from working.
          </p>
          <QrTools tables={tables.map((t) => ({ id: t.id, label: t.label }))} />
        </header>
        <ul className="qr-sheet">
          {codes.map((c) => (
            <li key={c.id} className="qr-card">
              <p className="qr-card__name">{restaurant.name}</p>
              <div className="qr-card__code" role="img" aria-label={`QR code for table ${c.label}`} dangerouslySetInnerHTML={{ __html: c.svg }} />
              <p className="qr-card__table">Table {c.label}</p>
              <p className="qr-card__hint">Scan to see the menu, order and pay</p>
              <p className="qr-card__url no-print">
                <a href={c.url}>{c.url}</a>
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
