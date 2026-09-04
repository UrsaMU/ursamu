/**
 * Resurrection — full raise (corpse/ally) vs cheap self-res.
 *
 * Full (+res corpse / staff raise): body + gear, 1 HP, at corpse.
 * Cheap (+res me, no spell): home, lose gear on corpse, some XP
 * and a cut of the multi-coin purse (cp/sp/ep/gp/pp).
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { getConfig } from "@ursamu/mush";
import { migrateSheet, type DndSheet } from "./dnd_sheet.ts";
import { defaultDeath, isDead } from "./death.ts";
import {
  formatPurse,
  syncGoldField,
  totalCp,
} from "./currency.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

/** Fraction of purse lost on cheap self-res (10%). */
const SELF_RES_COIN_FRAC = 0.1;
/** Fraction of XP lost on cheap self-res (10%). */
const SELF_RES_XP_FRAC = 0.1;

function sheetOf(p: IDBObj): DndSheet {
  return migrateSheet((p.state as Any)?.dnd);
}

function deathTravelOf(sheet: DndSheet): {
  corpseId?: string;
  deathRoomId?: string;
  spirit: boolean;
} {
  const d = (sheet.death ?? {}) as Any;
  return {
    corpseId: d.corpseId ? String(d.corpseId) : undefined,
    deathRoomId: d.deathRoomId
      ? String(d.deathRoomId)
      : undefined,
    spirit: !!d.spirit,
  };
}

function displayName(u: IUrsamuSDK, p: IDBObj): string {
  return (u.util.displayName(p, u.me) || p.name || "Someone")
    .split(";")[0];
}

function homeOf(spirit: IDBObj): string {
  const st = (spirit.state as Any) ?? {};
  const data = (spirit as Any).data ?? {};
  const h = st.home || data.home ||
    getConfig<string>("game.playerStart", "1");
  return String(h || "1");
}

/**
 * Remove a cut of the multi-coin purse (not all).
 * Works in copper-pieces total, then re-denominates.
 */
export function loseSomeCoins(
  sheet: DndSheet,
  frac = SELF_RES_COIN_FRAC,
): { sheet: DndSheet; lostCp: number; lostLabel: string } {
  let s = syncGoldField(structuredClone(sheet) as DndSheet);
  const before = totalCp(s);
  if (before <= 0) {
    return { sheet: s, lostCp: 0, lostLabel: "no coin" };
  }
  const lostCp = Math.max(
    1,
    Math.floor(before * Math.min(1, Math.max(0, frac))),
  );
  let cp = before - lostCp;
  s.money = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  s.money.pp = Math.floor(cp / 1000);
  cp %= 1000;
  s.money.gp = Math.floor(cp / 100);
  cp %= 100;
  s.money.ep = Math.floor(cp / 50);
  cp %= 50;
  s.money.sp = Math.floor(cp / 10);
  s.money.cp = cp % 10;
  s = syncGoldField(s);
  // Label lost amount in greedy coins for the message
  let L = lostCp;
  const bits: string[] = [];
  const pp = Math.floor(L / 1000);
  L %= 1000;
  const gp = Math.floor(L / 100);
  L %= 100;
  const ep = Math.floor(L / 50);
  L %= 50;
  const sp = Math.floor(L / 10);
  const cpx = L % 10;
  if (pp) bits.push(`${pp} pp`);
  if (gp) bits.push(`${gp} gp`);
  if (ep) bits.push(`${ep} ep`);
  if (sp) bits.push(`${sp} sp`);
  if (cpx) bits.push(`${cpx} cp`);
  return {
    sheet: s,
    lostCp,
    lostLabel: bits.join(", ") || "some coin",
  };
}

export function loseSomeXp(
  sheet: DndSheet,
  frac = SELF_RES_XP_FRAC,
): { sheet: DndSheet; lost: number } {
  const s = structuredClone(sheet) as DndSheet;
  const xp = Math.max(0, Number(s.xp) || 0);
  const lost = Math.max(0, Math.floor(xp * frac));
  s.xp = Math.max(0, xp - lost);
  return { sheet: s, lost };
}

async function destroyCorpse(
  u: IUrsamuSDK,
  corpse: IDBObj,
  keepLoot: boolean,
): Promise<void> {
  if (!keepLoot) {
    // Leave corpse (and gear) at death site for scavengers.
    return;
  }
  // Full raise: gear already moved; destroy empty shell
  try {
    await u.db.destroy(corpse.id);
  } catch {
    /* ok */
  }
}

/**
 * Full raise from corpse (ally at body) or staff.
 * Restores gear from corpse, 1 HP, at corpse location.
 */
export async function resurrectPlayer(
  u: IUrsamuSDK,
  opts: {
    corpse?: IDBObj;
    spirit?: IDBObj;
    hp?: number;
    /** Cheap self-res: home, lose gear/xp/some coin */
    cheap?: boolean;
  },
): Promise<{ ok: boolean; message: string }> {
  if (opts.cheap) {
    return await cheapSelfRes(u, opts.spirit ?? u.me);
  }

  let corpse = opts.corpse;
  let spirit = opts.spirit;

  if (corpse) {
    const d = (corpse.state as Any)?.dnd;
    if (d?.type !== "player_corpse" || !d.ownerId) {
      return { ok: false, message: "That is not a player corpse." };
    }
    // deno-lint-ignore no-explicit-any
    const found = await u.db.search({
      id: String(d.ownerId),
    } as any);
    spirit = found[0] ?? spirit;
    if (!spirit) {
      return {
        ok: false,
        message: "The spirit is lost — cannot raise.",
      };
    }
  } else if (spirit) {
    const sheet = sheetOf(spirit);
    const travel = deathTravelOf(sheet);
    if (travel.corpseId) {
      // deno-lint-ignore no-explicit-any
      const c = await u.db.search({
        id: travel.corpseId,
      } as any);
      corpse = c[0];
    }
  }

  if (!spirit) {
    return { ok: false, message: "No spirit to raise." };
  }

  const sheet = sheetOf(spirit);
  if (!isDead(sheet) && !deathTravelOf(sheet).spirit) {
    return { ok: false, message: "They are not dead." };
  }

  const dest = corpse?.location ||
    deathTravelOf(sheet).deathRoomId ||
    u.me.location;
  if (!dest) {
    return { ok: false, message: "No place to return the body." };
  }

  // Move gear back from corpse
  if (corpse) {
    // deno-lint-ignore no-explicit-any
    const loot = await u.db.search({ location: corpse.id } as any);
    for (const item of loot) {
      if (!item.flags?.has?.("thing")) continue;
      await u.db.modify(item.id, "$set", {
        location: spirit.id,
      });
    }
    await destroyCorpse(u, corpse, true);
  }

  const hp = Math.max(1, Math.floor(opts.hp ?? 1));
  const next: DndSheet = {
    ...sheet,
    hp: {
      ...sheet.hp,
      current: Math.min(sheet.hp.max, hp),
      temp: 0,
    },
    death: defaultDeath(),
  };
  await placeLiving(u, spirit, next, dest);

  const name = displayName(u, spirit);
  const msg =
    `%ch%cg${name}%cn draws breath again ` +
    `(${next.hp.current}/${next.hp.max} HP). Gear restored.`;
  announceRes(u, spirit, msg);
  return { ok: true, message: msg };
}

/**
 * Cheap self-res from the Veil: home, no gear reclaim, lose some
 * XP and a slice of the coin purse (all denominations).
 */
export async function cheapSelfRes(
  u: IUrsamuSDK,
  spirit: IDBObj,
): Promise<{ ok: boolean; message: string }> {
  const sheet = sheetOf(spirit);
  if (!isDead(sheet) && !deathTravelOf(sheet).spirit) {
    return { ok: false, message: "You are not dead." };
  }
  if (spirit.id !== u.me.id) {
    return {
      ok: false,
      message: "Only the spirit can choose a cheap return.",
    };
  }

  const home = homeOf(spirit);
  const travel = deathTravelOf(sheet);

  // Corpse + gear stay at death site (scavengers may +loot).
  // Do not move items back.
  if (travel.corpseId) {
    // optional: mark corpse as abandoned
    try {
      await u.db.modify(travel.corpseId, "$set", {
        "data.dnd.abandoned": true,
      });
    } catch {
      /* ok */
    }
  }

  let next = syncGoldField(sheet);
  const coin = loseSomeCoins(next, SELF_RES_COIN_FRAC);
  next = coin.sheet;
  const xpR = loseSomeXp(next, SELF_RES_XP_FRAC);
  next = xpR.sheet;
  next = {
    ...next,
    hp: {
      ...next.hp,
      current: Math.max(1, Math.min(next.hp.max, 1)),
      temp: 0,
    },
    death: defaultDeath(),
  };

  await placeLiving(u, spirit, next, home);

  const name = displayName(u, spirit);
  const bits = [
    `home with 1 HP`,
    xpR.lost > 0 ? `lost ${xpR.lost} XP` : null,
    coin.lostCp > 0 ? `lost ${coin.lostLabel}` : null,
    `gear left on your corpse`,
    `purse now ${formatPurse(next)}`,
  ].filter(Boolean);
  const msg =
    `%ch${name}%cn claws back to life the hard way — ` +
    bits.join("; ") + ".";
  announceRes(u, spirit, msg);
  return { ok: true, message: msg };
}

async function placeLiving(
  u: IUrsamuSDK,
  spirit: IDBObj,
  sheet: DndSheet,
  dest: string,
): Promise<void> {
  await u.db.modify(spirit.id, "$set", {
    "data.dnd": sheet,
    location: dest,
  });
  if (spirit.state) (spirit.state as Any).dnd = sheet;
  spirit.location = dest;
  try {
    u.teleport(spirit.id, dest);
  } catch {
    /* ok */
  }
}

function announceRes(
  u: IUrsamuSDK,
  spirit: IDBObj,
  msg: string,
): void {
  if (typeof u.broadcast === "function") {
    try {
      u.broadcast(msg, { exclude: [u.me.id] } as never);
    } catch {
      /* ok */
    }
  }
  u.send(msg);
  if (spirit.id !== u.me.id) {
    try {
      u.send(
        "%chYour spirit%cn is pulled back to your body!",
        spirit.id,
      );
    } catch {
      /* ok */
    }
  }
}
