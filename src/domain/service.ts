export type ServiceRequestKind = "waiter" | "bill";

export const SERVICE_REQUEST_LABELS: Record<ServiceRequestKind, string> = {
  waiter: "Call waiter",
  bill: "Bill requested",
};

export interface ServiceRequest {
  id: string;
  tableId: string;
  sessionId: string;
  kind: ServiceRequestKind;
  createdAt: number;
  resolvedAt?: number;
}

export function isOpen(request: ServiceRequest): boolean {
  return request.resolvedAt === undefined;
}

/** One open request per kind per session: tapping "call waiter" twice does not page staff twice. */
export function hasOpenRequest(requests: ServiceRequest[], sessionId: string, kind: ServiceRequestKind): boolean {
  return requests.some((r) => r.sessionId === sessionId && r.kind === kind && isOpen(r));
}

export interface Review {
  id: string;
  sessionId: string;
  tableId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  at: number;
}

export const MAX_REVIEW_COMMENT = 500;

export function parseRating(value: unknown): Review["rating"] | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? (value as Review["rating"])
    : undefined;
}
