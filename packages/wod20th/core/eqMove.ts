// core/eqMove.ts -- Clear live eq flags when items leave inventory.
// Listens for engine object:moved (get/drop/give/put).
import { gameHooks, dbojs } from "@ursamu/mush";

interface MovedPayload {
  objectId: string;
  from: string | null;
  to: string | null;
  cause?: string;
  actorId?: string;
}

/** Storage paths for live flags (dbojs uses data.*, not state.*). */
const UNSET_LIVE: Record<string, ""> = {
  "data.worn": "",
  "data.wielded": "",
  "data.concealed": "",
  "data.fetishActive": "",
};

function flagsHasPlayer(flags: unknown): boolean {
  if (!flags) return false;
  if (flags instanceof Set) return flags.has("player");
  if (typeof flags === "string") {
    return flags.toLowerCase().split(/\s+/).includes("player");
  }
  return false;
}

async function onObjectMoved(e: MovedPayload): Promise<void> {
  try {
    if (!e.objectId || !e.from || e.from === e.to) return;

    const prev = await dbojs.queryOne({ id: e.from });
    if (!prev || !flagsHasPlayer(prev.flags)) return;

    await dbojs.modify(
      { id: e.objectId },
      "$unset",
      UNSET_LIVE as never,
    );
  } catch {
    // Non-fatal -- never break move pipeline
  }
}

export function registerEqMoveHook(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on("object:moved", onObjectMoved);
}

export function unregisterEqMoveHook(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).off("object:moved", onObjectMoved);
}
