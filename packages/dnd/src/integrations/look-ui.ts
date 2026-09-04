/**
 * look:ui / look:text — subtle desc cues + action buttons.
 * No banner-style >> lines.
 */
import { gameHooks, type IDBObj, type IUrsamuSDK } from
  "@ursamu/mush";
import { isHostileMob } from "../combat/start-fight.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { roomEncounter, roomIdOf } from "../combat/session.ts";
import {
  descCue,
  dndBlob,
  failGetMsg,
  interactKind,
  isNoGet,
  useAction,
  withDescCue,
} from "../world/interact.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

type ActionItem = {
  id: string;
  label: string;
  action: { cmd: string };
};

function isMonster(o: IDBObj): boolean {
  const d = dndBlob(o);
  if (!d) return false;
  if (d.class === "Monster") return true;
  return isHostileMob(o);
}

/** Soften existing text components with a desc cue. */
function weaveCueIntoText(
  components: Any[],
  target: IDBObj,
): void {
  const cue = descCue(target);
  if (!cue) return;
  for (const c of components) {
    if (c?.type === "text" && typeof c.content === "string") {
      const cur = c.content.trim();
      if (cur.includes(cue.slice(0, 12))) return;
      c.content = cur ? `${cur} ${cue}` : cue;
      return;
    }
  }
  // No text block — add plain description (not a banner)
  components.push({ type: "text", content: cue });
}

async function mobActions(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<ActionItem[]> {
  const id = target.id;
  const items: ActionItem[] = [
    {
      id: `focus-${id}`,
      label: "Focus",
      action: { cmd: `+focus #${id}` },
    },
  ];
  const roomId = roomIdOf(u);
  const enc = roomId ? await roomEncounter(roomId) : null;
  const inCombat = !!(enc && enc.status === "active");
  const sheet = migrateSheet(dndBlob(target) || {});
  const down = (sheet.hp?.current ?? 0) <= 0;

  if (!inCombat) {
    items.push({
      id: `start-${id}`,
      label: "Fight",
      action: { cmd: "+combat/start" },
    });
  }
  if (!down) {
    items.push({
      id: `atk-${id}`,
      label: "Attack",
      action: { cmd: `+attack #${id}` },
    });
  } else {
    items.push({
      id: `kill-${id}`,
      label: "Finish",
      action: { cmd: `+kill #${id}` },
    });
  }
  return items;
}

async function onLookUi(e: {
  u: IUrsamuSDK;
  actor: IDBObj;
  target: IDBObj;
  components: Any[];
  isRoom?: boolean;
}): Promise<void> {
  if (!e?.components || !e.target) return;
  if (!(e.u.me.state as Any)?.dnd) return;

  const isRoom = e.isRoom || e.target.flags?.has?.("room");
  if (isRoom) {
    const contents = e.target.contents || [];
    const byId = new Map(contents.map((o) => [o.id, o]));
    for (const c of e.components) {
      if (c?.type !== "entity-list" || !Array.isArray(c.items)) {
        continue;
      }
      for (const it of c.items) {
        const obj = byId.get(it.id);
        if (!obj) continue;
        // Soft highlight interactive rows; no command text in meta
        const act = useAction(obj);
        if (act || isMonster(obj)) {
          it.usable = true;
        }
        if (act) it.action = { cmd: act.cmd };
        else if (isMonster(obj)) {
          it.action = { cmd: `look #${obj.id}` };
        }
      }
    }
    return;
  }

  // Single-object look: weave cue into description, actions only
  weaveCueIntoText(e.components, e.target);

  if (isMonster(e.target)) {
    const sheet = migrateSheet(dndBlob(e.target) || {});
    const cur = sheet.hp?.current ?? 0;
    const max = sheet.hp?.max ?? 0;
    // Soft HP in existing text if present
    if (max > 0) {
      const hpCue = cur <= 0
        ? "They look %chdown%cn."
        : cur < max / 2
        ? "They look %chwounded%cn."
        : "";
      if (hpCue) {
        for (const c of e.components) {
          if (c?.type === "text" && typeof c.content === "string") {
            if (!c.content.includes("wounded") &&
              !c.content.includes("down")) {
              c.content = `${c.content.trim()} ${hpCue}`;
            }
            break;
          }
        }
      }
    }
    const items = await mobActions(e.u, e.target);
    e.components.push({
      type: "actions",
      title: "Actions",
      items,
    });
    return;
  }

  const act = useAction(e.target);
  if (act) {
    e.components.push({
      type: "actions",
      title: "Actions",
      items: [
        {
          id: `use-${e.target.id}`,
          label: act.label,
          action: { cmd: act.cmd },
        },
      ],
    });
  }
}

async function onLookText(e: {
  u: IUrsamuSDK;
  actor: IDBObj;
  target: IDBObj;
  text: string;
}): Promise<void> {
  if (!e?.target) return;
  if (!(e.u.me.state as Any)?.dnd) return;
  if (e.target.flags?.has?.("room")) return;

  // Append subtle cue to the look text (no FOE/USE banners)
  const cue = descCue(e.target);
  if (cue && !e.text.includes(cue.slice(0, 16))) {
    e.text = e.text.replace(/\s*$/, "") + "\n " + cue;
  }
  if (isMonster(e.target)) {
    const sheet = migrateSheet(dndBlob(e.target) || {});
    const cur = sheet.hp?.current ?? 0;
    const max = sheet.hp?.max ?? 0;
    if (max > 0 && cur <= 0 && !e.text.includes("down")) {
      e.text += "\n They look %chdown%cn.";
    } else if (max > 0 && cur < max / 2 && cur > 0 &&
      !e.text.includes("wounded")) {
      e.text += "\n They look %chwounded%cn.";
    }
  }
}

async function onObjectGet(e: {
  thing?: IDBObj;
  allow?: boolean;
  message?: string;
}): Promise<void> {
  if (!e?.thing) return;
  if (!isNoGet(e.thing)) return;
  e.allow = false;
  e.message = failGetMsg(e.thing);
}

export function initLookUiHook(): void {
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.on?.("look:ui", onLookUi);
  h.on?.("look:text", onLookText);
  h.on?.("object:get", onObjectGet);
}

export function removeLookUiHook(): void {
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.off?.("look:ui", onLookUi);
  h.off?.("look:text", onLookText);
  h.off?.("object:get", onObjectGet);
}
