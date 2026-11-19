import Link from "next/link";
import { DEMO_RESTAURANT, DEMO_TABLES } from "@/server/seed";

const STEPS = [
  "Scan the table QR: the menu opens in the browser, no app.",
  "Every dish shows price, half/full size, allergens, spice level and deals.",
  "Guests order from their phones; staff confirm and send it to the kitchen in one tap.",
  "The kitchen screen shows live orders by station with timers.",
  "Guests see live status and an estimated time while food cooks.",
  "“Call waiter” reaches staff within seconds.",
  "Staff see a live floor map: free, ordering, eating, needs help, bill requested.",
  "Split the bill, add a tip and pay at the table by UPI, card, cash or bank transfer.",
  "One-tap review after paying.",
  "The owner sees tables, orders and sales for today.",
];

export default function Home() {
  return (
    <main id="main" className="home">
      <section className="hero">
        <p className="eyebrow">Prototype · in-memory · not production</p>
        <h1>
          Table<span>Tap</span>
        </h1>
        <p className="lede">
          QR-at-the-table ordering, kitchen display and pay-at-table for Indian restaurants and cafes. Built in INR,
          UPI first.
        </p>
      </section>

      <section aria-labelledby="try" className="card">
        <h2 id="try">Try the demo</h2>
        <p className="muted">
          {DEMO_RESTAURANT.name} is a made-up demo restaurant. Open a table on one device (or tab) and the staff and
          kitchen screens on another; they refresh every few seconds.
        </p>
        <h3>Guest view: pick a table</h3>
        <ul className="table-links">
          {DEMO_TABLES.map((t) => (
            <li key={t.id}>
              <Link href={`/t/${t.id}`} className="btn btn--ghost">
                Table {t.label}
                <small>{t.seats} seats</small>
              </Link>
            </li>
          ))}
        </ul>
        <h3>Restaurant views</h3>
        <ul className="view-links">
          <li>
            <Link href="/staff" className="btn">
              Staff: floor map and orders
            </Link>
          </li>
          <li>
            <Link href="/kitchen" className="btn">
              Kitchen display
            </Link>
          </li>
          <li>
            <Link href="/owner" className="btn">
              Owner: today
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="flow" className="card">
        <h2 id="flow">The flow it covers</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="muted">
          Payments are simulated. Nothing is charged, no email is sent and data resets when the server restarts. See
          PLAN.md in the repository for the road to a real pilot.
        </p>
      </section>
    </main>
  );
}
