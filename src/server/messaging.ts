/**
 * Messaging adapters. Only the simulated WhatsApp adapter exists: it writes each message to the `outbox`
 * table, which the owner can read on the Campaigns screen. No network calls, no API keys.
 * A real adapter (WhatsApp Cloud API via a BSP) would implement the same interface.
 */
import { schema as s, type DbOrTx } from "./db/client";
import { newId, toDate } from "./store/repo";

export interface OutgoingMessage {
  restaurantId: string;
  toPhone: string;
  customerId?: string;
  campaignId?: string;
  /** Meta template category: marketing needs marketing consent; utility needs service consent. */
  category: "marketing" | "utility";
  body: string;
  at: number;
}

export interface MessagingAdapter {
  readonly name: string;
  send(db: DbOrTx, message: OutgoingMessage): Promise<{ id: string; status: string }>;
}

export const simulatedWhatsApp: MessagingAdapter = {
  name: "simulated-whatsapp",
  async send(db, m) {
    const id = newId("msg");
    await db.insert(s.outbox).values({
      id,
      restaurantId: m.restaurantId,
      channel: "whatsapp",
      category: m.category,
      toPhone: m.toPhone,
      customerId: m.customerId ?? null,
      campaignId: m.campaignId ?? null,
      body: m.body,
      status: "simulated_sent",
      adapter: "simulated-whatsapp",
      createdAt: toDate(m.at),
    });
    return { id, status: "simulated_sent" };
  },
};

/** The adapter in use. Always simulated in this MVP. */
export function messaging(): MessagingAdapter {
  return simulatedWhatsApp;
}
