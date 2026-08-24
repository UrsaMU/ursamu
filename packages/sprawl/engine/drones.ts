/**
 * Personal drones as Things (kind=drone).
 * Deploy one active drone; use effect by slug.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type { ISprawlChar, SprawlItemData } from
  "../db/schemas.ts";
import { itemData, writeItemData, destroyItem } from "./items.ts";
import { applyResilience } from "./action.ts";
import { explosiveDamage } from "./specialty-combat.ts";

export function isDrone(
  d: SprawlItemData | null | undefined,
): boolean {
  return !!d && String(d.kind) === "drone";
}

export function listDrones(items: IDBObj[]): IDBObj[] {
  return items.filter((o) => isDrone(itemData(o)));
}

export function getActiveDrone(
  items: IDBObj[],
  c: ISprawlChar,
): IDBObj | null {
  const id = c.activeDroneId;
  if (!id) return null;
  return items.find((o) => o.id === id && isDrone(itemData(o))) ??
    null;
}

export async function deployDrone(
  u: IUrsamuSDK,
  c: ISprawlChar,
  drone: IDBObj,
  _actorId?: string,
): Promise<ISprawlChar> {
  const d = itemData(drone);
  if (!isDrone(d)) throw new Error("not a drone");
  await writeItemData(u, drone, {
    ...d!,
    slot: "worn",
    notes: d!.notes ?? "deployed",
  });
  return { ...c, activeDroneId: drone.id };
}

export async function stowDrone(
  u: IUrsamuSDK,
  c: ISprawlChar,
  drone: IDBObj | null,
): Promise<ISprawlChar> {
  if (drone) {
    const d = itemData(drone);
    if (d) {
      await writeItemData(u, drone, {
        ...d,
        slot: "carried",
      });
    }
  }
  const next = { ...c };
  delete next.activeDroneId;
  return next;
}

export type DroneUseResult = {
  ok: boolean;
  message: string;
  sheet?: ISprawlChar;
  destroy?: boolean;
};

/**
 * Activate deployed drone effect.
 * medi → heal 2; bomb → 3d6 blast + destroy; attack → narrative DS.
 */
export function useDroneEffect(
  c: ISprawlChar,
  d: SprawlItemData,
  rng = Math.random,
): DroneUseResult {
  const slug = d.slug.toLowerCase();
  if (slug.includes("medi")) {
    const next = applyResilience(c, 2);
    return {
      ok: true,
      message: `Medi-drone heals +2 Res → ${next.resilience}`,
      sheet: next,
    };
  }
  if (slug.includes("bomb")) {
    const blast = explosiveDamage(3, () =>
      1 + Math.floor(rng() * 6)
    );
    return {
      ok: true,
      message:
        `Bomb drone detonates [${blast.rolls.join("+")}]` +
        ` = ${blast.total} Res blast` +
        (blast.minApplied ? " (min floor)" : ""),
      destroy: true,
    };
  }
  if (
    slug.includes("defence") ||
    slug.includes("assassin") ||
    slug.includes("targeting")
  ) {
    return {
      ok: true,
      message:
        `${d.slug} fires — treat as +attack with +1` +
        ` (drone assist) this round`,
    };
  }
  if (slug.includes("sa-") || slug.includes("situational")) {
    return {
      ok: true,
      message: "SA drone: +1 to spotting / Reaction notice",
    };
  }
  if (slug.includes("surveillance") || slug.includes("tracker")) {
    return {
      ok: true,
      message: "Feed live — target tagged / AV broadcast up",
    };
  }
  if (slug.includes("holo")) {
    return {
      ok: true,
      message: "Holo emitter projects a programmed decoy",
    };
  }
  if (slug.includes("ortillery")) {
    return {
      ok: true,
      message: "Spotter lock — orbital fire is a scene beat",
    };
  }
  if (slug.includes("buddy")) {
    return {
      ok: true,
      message: "Buddy bot assists — Upgrade on one simple task",
    };
  }
  return {
    ok: true,
    message: `${d.slug} active — GM interprets effect`,
  };
}

export async function destroyDroneThing(
  u: IUrsamuSDK,
  drone: IDBObj,
): Promise<void> {
  await destroyItem(u, drone.id);
}
