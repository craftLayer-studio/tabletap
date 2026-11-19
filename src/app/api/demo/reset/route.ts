import { handle } from "@/server/http";
import { resetState } from "@/server/store";

/** Re-seed the in-memory demo. Prototype only: M1 removes this route. */
export async function POST() {
  return handle(() => {
    resetState();
    return { ok: true };
  });
}
