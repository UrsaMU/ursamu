/**
 * look:text / look:ui — Sprawl PC prose + hide boarded crew
 * from room player lists (vehicle still shows as a Thing).
 */
import {
  defaultConformatHandler,
  gameHooks,
  registerFormatHandler,
  unregisterFormatHandler,
} from "@ursamu/mush";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { getChar, getInventory } from "../engine/sheet-io.ts";
import {
  frameStreetLook,
  resolveLook,
} from "../engine/desc.ts";
import {
  formatNpcLook,
  isSprawlNpc,
  npcData,
} from "../engine/npcs.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

type LookTextEvt = {
  u: IUrsamuSDK;
  actor: IDBObj;
  target: IDBObj;
  text: string;
};

type LookUiEvt = {
  u: IUrsamuSDK;
  actor: IDBObj;
  target: IDBObj;
  components: Any[];
  isRoom?: boolean;
};

/** True when a player is seated in a vehicle (hidden in room). */
export function isHiddenInVehicle(obj: IDBObj): boolean {
  if (!obj?.flags?.has?.("player")) return false;
  const c = getChar(obj);
  return !!(c?.activeVehicleId);
}

async function sprawlLookText(
  u: IUrsamuSDK,
  target: IDBObj,
  opts: { frame?: boolean } = {},
): Promise<string | null> {
  // Room NPC Things
  if (isSprawlNpc(target)) {
    const text = formatNpcLook(target) ||
      npcData(target)?.name ||
      target.name ||
      "NPC";
    if (opts.frame === false) return text;
    return frameStreetLook(text, {
      name: String(npcData(target)?.name ?? target.name ?? "NPC"),
    });
  }
  if (!target.flags?.has?.("player")) return null;
  const c = getChar(target);
  if (!c || c.chargenStatus === "none") return null;
  const { items } = await getInventory(u, target);
  const prose = await resolveLook(u, target, c, items);
  if (!prose) return null;
  if (opts.frame === false) return prose;
  // Badge = plain sheet name; moniker already in prose.
  const countName = String(c.name || "GOON").trim() || "GOON";
  return frameStreetLook(prose, { name: countName });
}

function isEmptyStockDesc(cur: string): boolean {
  const t = cur.trim().toLowerCase();
  return !t || t.includes("nothing special");
}

/**
 * CONFORMAT for rooms: drop boarded PCs from the id list,
 * then use stock room layout. Vehicles stay in Contents.
 */
const sprawlConformat = async (
  u: IUrsamuSDK,
  target: IDBObj,
  idList: string,
): Promise<string | null> => {
  if (!target.flags?.has?.("room")) return null;
  const contents = target.contents || [];
  const ids = idList
    .split(/\s+/)
    .map((id) => id.replace(/^#/, "").trim())
    .filter(Boolean);
  const kept = ids.filter((id) => {
    const o = contents.find((c) => c.id === id);
    if (!o) return true;
    return !isHiddenInVehicle(o);
  });
  const filtered = kept.map((id) => `#${id}`).join(" ");
  return await defaultConformatHandler(u, target, filtered);
};

const onLookText = async (e: LookTextEvt): Promise<void> => {
  if (!e?.u || !e.target) return;
  try {
    const prose = await sprawlLookText(e.u, e.target);
    if (!prose) return;
    e.text = prose.split("\n").join("\r\n");
  } catch {
    /* best-effort */
  }
};

/** Strip boarded PCs from web room character lists. */
function filterRoomUiComponents(
  e: LookUiEvt,
): void {
  if (!e.isRoom && !e.target?.flags?.has?.("room")) return;
  const contents = e.target.contents || [];
  for (const comp of e.components ?? []) {
    if (comp?.type !== "entity-list") continue;
    const title = String(comp.title ?? "").toLowerCase();
    if (
      title !== "characters" &&
      title !== "players" &&
      !title.includes("character")
    ) {
      continue;
    }
    const items = comp.items as Any[] | undefined;
    if (!Array.isArray(items)) continue;
    comp.items = items.filter((it) => {
      const id = String(it?.id ?? it?.dbref ?? "");
      if (!id) return true;
      const o = contents.find(
        (c) => c.id === id || c.id === id.replace(/^#/, ""),
      );
      if (!o) return true;
      return !isHiddenInVehicle(o);
    });
  }
}

const onLookUi = async (e: LookUiEvt): Promise<void> => {
  if (!e?.u || !e.target) return;
  try {
    // Room: hide boarded crew in character entity lists.
    if (e.isRoom || e.target.flags?.has?.("room")) {
      filterRoomUiComponents(e);
      return;
    }
    // Player look: inject sprawl prose.
    const prose = await sprawlLookText(e.u, e.target);
    if (!prose) return;
    let filled = false;
    for (const comp of e.components ?? []) {
      if (
        comp?.type === "text" &&
        typeof comp.content === "string"
      ) {
        if (
          isEmptyStockDesc(comp.content) ||
          getChar(e.target)
        ) {
          comp.content = prose;
          filled = true;
          break;
        }
      }
    }
    if (!filled) {
      e.components = [
        ...(e.components ?? []),
        { type: "text", content: prose },
      ];
    }
  } catch {
    /* best-effort */
  }
};

/** +glance: drop boarded PCs from the visible player list. */
const onGlancePlayers = (bag: {
  players?: IDBObj[];
}): void => {
  if (!Array.isArray(bag?.players)) return;
  bag.players = bag.players.filter((p) => !isHiddenInVehicle(p));
};

export function initLookHooks(): void {
  registerFormatHandler("CONFORMAT", sprawlConformat, {
    prepend: true,
  });
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.on?.("look:text", onLookText);
  h.on?.("look:ui", onLookUi);
  h.on?.("glance:players", onGlancePlayers);
}

export function removeLookHooks(): void {
  unregisterFormatHandler("CONFORMAT", sprawlConformat);
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.off?.("look:text", onLookText);
  h.off?.("look:ui", onLookUi);
  h.off?.("glance:players", onGlancePlayers);
}
