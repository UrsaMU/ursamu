/**
 * Interactive world props: subtle desc cues + no-get locks.
 * No banner-style >> hints — weave into description instead.
 */
import type { IDBObj } from "@ursamu/ursamu";

// deno-lint-ignore no-explicit-any
type Any = any;

export type InteractKind =
  | "chest"
  | "altar"
  | "campfire"
  | "view"
  | "corpse"
  | "player_corpse"
  | "scenery"
  | "monster"
  | "vendor"
  | "other";

export function dndBlob(o: IDBObj): Any {
  return (o.state as Any)?.dnd ?? (o as Any).data?.dnd ?? {};
}

export function interactKind(o: IDBObj): InteractKind {
  const d = dndBlob(o);
  const t = String(d.type || "").toLowerCase();
  if (t === "chest") return "chest";
  if (t === "altar") return "altar";
  if (t === "campfire") return "campfire";
  if (t === "view") return "view";
  if (t === "corpse") return "corpse";
  if (t === "player_corpse") return "player_corpse";
  if (t === "scenery") return "scenery";
  if (d.class === "Monster" || o.flags?.has?.("npc")) {
    return "monster";
  }
  if ((o.state as Any)?.vendor || d.vendor) return "vendor";
  return "other";
}

/** True if players should not `get` this object. */
export function isNoGet(o: IDBObj): boolean {
  const k = interactKind(o);
  if (
    k === "chest" || k === "altar" || k === "campfire" ||
    k === "view" || k === "corpse" || k === "player_corpse" ||
    k === "scenery" || k === "monster" || k === "vendor"
  ) {
    return true;
  }
  const d = dndBlob(o);
  if (d.noGet === true || d.scenery === true) return true;
  return false;
}

/**
 * Subtle prose for descriptions — light %ch on the key verb.
 * Empty if nothing to say.
 */
export function descCue(o: IDBObj): string {
  const d = dndBlob(o);
  const k = interactKind(o);
  switch (k) {
    case "chest":
      if (d.opened) {
        return "The lid hangs open; nothing remains inside.";
      }
      return "The %chlid%cn looks ready to %chopen%cn.";
    case "altar":
      if (d.used) {
        return "Its power feels spent.";
      }
      return "You might %chtouch%cn the stone.";
    case "campfire":
      if (d.used) {
        return "Only ash and warmth remain.";
      }
      return "The coals invite you to %chuse%cn them and rest.";
    case "view":
      return "A quiet place to %chlook%cn longer.";
    case "corpse":
      return "Something might be worth a careful %chloot%cn.";
    case "player_corpse":
      return "A body awaits %chres%cnurrection — or scavenging.";
    case "monster":
      return ""; // combat UI handles foes
    case "vendor":
      return "Wares might be for sale if you %chlist%cn them.";
    case "scenery":
      return "";
    default:
      if (d.cue) return String(d.cue);
      return "";
  }
}

/** Fail message when get is denied — short, no banners. */
export function failGetMsg(o: IDBObj): string {
  const k = interactKind(o);
  switch (k) {
    case "chest":
      return "It's fixed in place. Try opening it.";
    case "altar":
    case "campfire":
      return "That stays put. You could use it instead.";
    case "view":
    case "scenery":
      return "That is part of the room.";
    case "corpse":
      return "Leave the body. Try looting it.";
    case "player_corpse":
      return "That is someone's body. Try res or loot.";
    case "monster":
      return "You can't pick that up.";
    case "vendor":
      return "They won't fit in your pack.";
    default:
      return "You can't pick that up.";
  }
}

/** @deprecated use descCue / failGetMsg */
export function useHint(o: IDBObj): string {
  return descCue(o);
}

/** Short meta for room entity rows (subtle, not commands). */
export function useMeta(o: IDBObj): string {
  const d = dndBlob(o);
  const k = interactKind(o);
  switch (k) {
    case "chest":
      return d.opened ? "open" : "";
    case "altar":
      return d.used ? "" : "";
    case "campfire":
      return d.used ? "" : "";
    case "corpse":
    case "player_corpse":
      return "";
    case "monster":
      return "";
    case "vendor":
      return "";
    default:
      return "";
  }
}

/** Web action button — uses core verbs open/use/loot. */
export function useAction(
  o: IDBObj,
): { label: string; cmd: string } | null {
  const d = dndBlob(o);
  const id = o.id;
  const k = interactKind(o);
  switch (k) {
    case "chest":
      if (d.opened) return null;
      return { label: "Open", cmd: `open #${id}` };
    case "altar":
    case "campfire":
      if (d.used) return null;
      return {
        label: k === "campfire" ? "Rest" : "Touch",
        cmd: `use #${id}`,
      };
    case "corpse":
      return { label: "Loot", cmd: `+loot #${id}` };
    case "player_corpse":
      return { label: "Resurrect", cmd: `+res #${id}` };
    case "monster":
      return { label: "Attack", cmd: `+attack #${id}` };
    case "vendor":
      return { label: "Shop", cmd: "+list" };
    default:
      return null;
  }
}

/**
 * createObj payload: no-get lock for players (wizard cleanup ok).
 */
export function noGetData(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    locks: {
      basic: "flag(wizard)",
      ...(extra.locks as object || {}),
    },
    FAIL: "That is fixed in place.",
  };
}

/** Append desc cue to a description string if not already present. */
export function withDescCue(
  description: string,
  o: IDBObj,
): string {
  const cue = descCue(o);
  if (!cue) return description;
  const base = String(description || "").trim();
  if (!base) return cue;
  // Avoid doubling if spawn already baked a similar line
  if (base.includes("open") && cue.includes("open")) {
    return base;
  }
  return `${base} ${cue}`;
}
