// Resolve material vs fae names/descs for look (soft dual layer).

import type { IDBObj } from "@ursamu/ursamu";
import {
  displayName,
  itemData,
  type CofdItemData,
} from "../equipment/objects.ts";
import { findFruit } from "../hedge/fruit_catalog.ts";
import type { HedgeRoom, Hedgeway } from "../hedge/types.ts";
import { hasFaeSight } from "./sight.ts";

const DEFAULT_WAY_MASK = "Strange passage";

/**
 * Soft dual name: fae (or staff) sees trueName; others see
 * maskName when set, else trueName.
 */
export function resolveDualName(
  looker: IDBObj | null | undefined,
  trueName: string,
  maskName?: string | null,
): string {
  const mask = maskName?.trim();
  if (!mask) return trueName;
  if (hasFaeSight(looker)) return trueName;
  return mask;
}

/** True (fae) item label — catalog / customLabel / name. */
export function itemTrueName(obj: IDBObj): string {
  return displayName(obj);
}

/** Mortal-facing label when maskName is set. */
export function itemMaskName(obj: IDBObj): string {
  const d = itemData(obj);
  if (d?.maskName?.trim()) return d.maskName.trim();
  return itemTrueName(obj);
}

/**
 * CONFORMAT / inventory label for a thing.
 * Soft: without fae sight, prefer maskName when present.
 */
export function resolveItemLookName(
  looker: IDBObj,
  obj: IDBObj,
): string {
  const d = itemData(obj);
  return resolveDualName(
    looker,
    itemTrueName(obj),
    d?.maskName,
  );
}

/** Hedgeway display name for +hedge status / list. */
export function resolveWayName(
  looker: IDBObj | null | undefined,
  way: Pick<Hedgeway, "name" | "maskName">,
): string {
  return resolveDualName(
    looker,
    way.name,
    way.maskName?.trim() || DEFAULT_WAY_MASK,
  );
}

/** Room hedge flavor line (status), dual when maskFlavor set. */
export function resolveRoomFlavor(
  looker: IDBObj | null | undefined,
  room: HedgeRoom | null,
): string {
  if (!room) return "";
  const trueF = room.flavor?.trim() ?? "";
  const maskF = room.maskFlavor?.trim() ?? "";
  if (!trueF && !maskF) return "";
  if (hasFaeSight(looker)) return trueF || maskF;
  return maskF || trueF;
}

/** Room / object FAEDESC from state or attributes list. */
export function readFaeDesc(target: IDBObj): string {
  const st = target.state ?? {};
  const direct = st.faedesc ?? st.desc_fae ?? st.FAEDESC;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const attrs = st.attributes as
    | { name?: string; value?: string }[]
    | undefined;
  if (!Array.isArray(attrs)) return "";
  const hit = attrs.find(
    (a) =>
      a.name?.toLowerCase() === "faedesc" ||
      a.name?.toLowerCase() === "desc_fae",
  );
  return hit?.value?.trim() ?? "";
}

/**
 * Pick description body for DESCFORMAT.
 * materialDesc is already the engine default (DESC / description).
 */
export function resolveLookDesc(
  looker: IDBObj,
  target: IDBObj,
  materialDesc: string,
): string {
  if (!hasFaeSight(looker)) return materialDesc;
  const fae = readFaeDesc(target);
  return fae || materialDesc;
}

/** Optional true-name hint for goblin fruit in staff notes. */
export function fruitTrueSlugLabel(d: CofdItemData): string {
  if (d.kind !== "goblin-fruit") return d.key;
  return findFruit(d.key)?.name ?? d.key;
}
