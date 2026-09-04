/**
 * Persist NAWS / client terminal size onto the player object.
 */
import { gameHooks, sessions, clampTermWidth, clampTermHeight } from "@ursamu/core";
import { dbojs } from "../world/dbobjs.ts";

type TermSizeEvent = {
  socketId: string;
  termWidth?: unknown;
  termHeight?: unknown;
  cid?: string;
};

async function onTermSize(e: TermSizeEvent): Promise<void> {
  const w = clampTermWidth(e.termWidth);
  const h = clampTermHeight(e.termHeight);
  if (w == null && h == null) return;

  const session = sessions.get(e.socketId);
  // Prefer explicit cid (telnet sidecar), else session actor.
  const actorId =
    (typeof e.cid === "string" && e.cid) ||
    (session as { actorId?: string } | undefined)?.actorId ||
    session?.sessionId ||
    null;
  if (!actorId || actorId === "#-1") return;

  const patch: Record<string, unknown> = {};
  if (w != null) patch["data.termWidth"] = w;
  if (h != null) patch["data.termHeight"] = h;

  try {
    const prior = await dbojs.queryOne({ id: actorId });
    if (!prior) return;
    await dbojs.modify({ id: actorId }, "$set", patch);
  } catch (err: unknown) {
    console.error("[term-size] persist failed:", err);
  }
}

let _wired = false;

/** Idempotent: subscribe session:termSize → player data.termWidth/Height. */
export function wireTermSizePersistence(): void {
  if (_wired) return;
  _wired = true;
  gameHooks.on("session:termSize", onTermSize);
}

export function unwiredTermSizePersistence(): void {
  if (!_wired) return;
  gameHooks.off("session:termSize", onTermSize);
  _wired = false;
}
