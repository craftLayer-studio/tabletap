export interface Restaurant {
  id: string;
  name: string;
  city: string;
  /** GST percent applied to food. The demo uses 5%; real rates depend on the outlet (see PLAN.md). */
  taxPercent: number;
  /** UPI ID. The demo one is deliberately not a real handle: never pay to it. */
  upiVpa: string;
  isDemo: boolean;
  /** Google review link (for example a g.page/r/... URL). 4-5 star reviews are invited to post there. */
  googleReviewUrl?: string;
}
