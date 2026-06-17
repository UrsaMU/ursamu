/**
 * caret-patterns.ts
 *
 * `^pattern` listener dispatch for MONITOR-flagged objects.
 *
 * Objects can react to room text (say, pose, emit) by setting attributes
 * whose names begin with `^`. When a player speaks or acts in a room, every
 * object in that room with the MONITOR flag is scanned for matching `^`
 * attributes. On a hit the attribute's value is executed as softcode
 * (captures mapped to %0–%9) in the context of the listening object.
 *
 * Pattern syntax (glob) is identical to $-patterns:
 *   ^hello *         matches "Alice says, \"hello world\"" with %0="world"
 *   ^*               matches any heard text (wildcard only)
 *   ^The lights *    exact prefix match with one capture
 *
 * Matching is case-insensitive. The object that spoke is NOT matched against
 * its own ^-patterns (an object cannot hear itself).
 */
import type { IDBOBJ } from "./types.ts";
import { matchGlob } from "./dollar-patterns.ts";

export interface CaretMatch {
  obj:       IDBOBJ;
  attrName:  string;
  attrValue: string;
  captures:  string[];
}

type CaretExecutorFn = (
  attrValue: string,
  actorId:   string,
  socketId:  string,
  captures:  string[],
) => Promise<void>;

let _caretExecutor: CaretExecutorFn | null = null;

/**
 * Register the softcode executor used by fireCaretPatterns.
 * Called once during engine startup (e.g., from softcode/engine.ts).
 */
export function registerCaretExecutor(fn: CaretExecutorFn): void {
  _caretExecutor = fn;
}

/**
 * Scan objects in `roomId` (and optionally the master room) for `^pattern`
 * attributes matching `text`.
 *
 * Only objects with the `monitor` flag set are scanned. The `speakerId` is
 * excluded so objects do not react to their own text.
 *
 * Returns all matches (an object may have multiple matching `^` attrs).
 */
export async function findCaretMatches(
  roomId:        string,
  text:          string,
  speakerId:     string,
  dbojs:         { query: (q: unknown) => Promise<IDBOBJ[]> },
  masterRoomId?: string,
): Promise<CaretMatch[]> {
  const hits: CaretMatch[] = [];

  const scanContents = async (locId: string) => {
    const contents = await dbojs.query({ location: locId });
    for (const obj of contents) {
      if (obj.id === speakerId) continue;

      const flagStr = (obj.flags || "").toLowerCase();
      if (!flagStr.includes("monitor")) continue;

      const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) ?? [];
      for (const attr of attrs) {
        if (!attr.name.startsWith("^")) continue;

        const slashIdx = attr.name.indexOf("/", 1);
        const pattern  = slashIdx === -1 ? attr.name.slice(1) : attr.name.slice(1, slashIdx);

        const captures = matchGlob(pattern.trim(), text);
        if (captures !== null) {
          hits.push({ obj, attrName: attr.name, attrValue: attr.value, captures });
        }
      }
    }
  };

  await scanContents(roomId);

  if (masterRoomId && masterRoomId !== roomId && masterRoomId !== "0") {
    await scanContents(masterRoomId);
  }

  return hits;
}

/**
 * Fire all matching `^pattern` attrs in `roomId` for the given heard `text`.
 *
 * Evaluates each matched attr's value as softcode with captures mapped to
 * %0–%9 in the context of the listening object. Errors from individual
 * handlers are caught and logged so they never interrupt the caller.
 */
export async function fireCaretPatterns(
  roomId:        string,
  text:          string,
  speakerId:     string,
  socketId:      string,
  dbojs:         { query: (q: unknown) => Promise<IDBOBJ[]> },
  masterRoomId?: string,
): Promise<void> {
  const matches = await findCaretMatches(roomId, text, speakerId, dbojs, masterRoomId);
  if (matches.length === 0) return;

  if (!_caretExecutor) {
    // No executor registered yet — skip silently (engine not fully started)
    return;
  }

  for (const { obj, attrValue, captures } of matches) {
    try {
      await _caretExecutor(attrValue, obj.id, socketId, captures);
    } catch (e: unknown) {
      console.error(`[caretPatterns] Error in ^-pattern on #${obj.id}:`, e);
    }
  }
}
