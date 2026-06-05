// Local logger helpers — bridge re-exports removed; callers use @ursamu/core directly.
import { log as _log } from "@ursamu/core";

// Legacy logError helper (used in main.ts error handlers)
export async function logError(error: unknown, context = "Error"): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  _log("error", context, { message: msg });
}
