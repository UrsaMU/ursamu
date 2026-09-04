/**
 * +ammo -- View loadout, switch loaded ammo, buy ammo.
 *
 * Storage:
 *   state.cpr.ammoLoaded   Record<weaponName, ammoType>. Absence => "basic".
 *   state.cpr.gear         IGearItem[]. Ammo packs live here as type "ammo".
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IGearItem } from "../db/schemas.ts";
import {
  AMMO, getAmmo, ammoForWeaponType, defaultAmmoForWeaponType,
  type AmmoType,
} from "../data/ammo.ts";
import { getWeapon } from "../data/weapons.ts";
import {
  bar, div, hdr, val, acc, dim, ARR, ERR, OK, tbl,
} from "./chargen.ts";

const AMMO_PACK_SIZE = 10;

addCmd({
  name: "+ammo",
  pattern: /^\+ammo(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+ammo[/switch] [<args>]  -- Manage ammunition loadout.

Switches:
  /list                       Show ammo loaded in each owned weapon.
  /types [<weapon>]           Show ammo types compatible with a weapon.
  /load <weapon>=<ammo>       Load an ammo type into a weapon.
  /buy <ammo>                 Buy a 10-round pack of ammo (deducts eb).

Examples:
  +ammo                       Same as +ammo/list.
  +ammo/types medium_pistol   List ammo types usable in medium pistol.
  +ammo/load assault_rifle=armor_piercing
  +ammo/buy armor_piercing    Buy 10 rounds of AP ammo.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "list" || !sw) { showLoadout(u, cpr); return; }
    if (sw === "types")       { showAmmoTypes(u, arg); return; }
    if (sw === "load")        { await loadAmmo(u, cpr, arg); return; }
    if (sw === "buy")         { await buyAmmo(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}.`);
  },
});

function ownedWeapons(cpr: ICPRCharacter): IGearItem[] {
  return (cpr.gear ?? []).filter((g) => g.type === "weapon");
}

function showLoadout(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const loaded = cpr.ammoLoaded ?? {};
  const weapons = ownedWeapons(cpr);
  const out: string[] = [bar(), hdr("AMMO LOADOUT"), bar()];
  if (weapons.length === 0) {
    out.push(`  ${dim("No weapons in inventory.")}`);
  } else {
    const rows: string[][] = weapons.map((w) => {
      const def = getWeapon(w.name);
      const dflt = def ? defaultAmmoForWeaponType(def.type) : "basic";
      const id   = (loaded[w.name] ?? dflt) as AmmoType;
      const amm  = getAmmo(id);
      return [val(w.name), acc(amm?.label ?? id), dim(amm?.description ?? "")];
    });
    out.push(...tbl(
      [{ label: "WEAPON", width: 20 }, { label: "AMMO", width: 16 }, { label: "EFFECT", width: 38 }],
      rows,
    ));
  }
  out.push(div());
  out.push(`  ${ARR}${val("+ammo/load <weapon>=<ammo>")}  ${dim("-- swap loaded ammo")}`);
  out.push(`  ${ARR}${val("+ammo/buy <ammo>")}            ${dim("-- buy a 10-round pack")}`);
  out.push(`  ${ARR}${val("+ammo/types <weapon>")}        ${dim("-- list compatible ammo")}`);
  out.push(bar());
  u.send(out.join("\r\n"));
}

function showAmmoTypes(u: IUrsamuSDK, arg: string): void {
  const showWeapon = arg ? getWeapon(arg) : null;
  if (arg && !showWeapon) { u.send(`${ERR}Unknown weapon ${val(arg)}.`); return; }
  const list = showWeapon ? ammoForWeaponType(showWeapon.type) : AMMO;
  const out: string[] = [
    bar(),
    hdr(showWeapon ? `AMMO :: ${showWeapon.name.toUpperCase()}` : "ALL AMMO TYPES"),
    bar(),
    ...tbl(
      [
        { label: "TYPE", width: 18 },
        { label: "EB/10", width: 6, align: "right" as const },
        { label: "EFFECT", width: 50 },
      ],
      list.map((a) => [val(a.id), val(String(a.costEb)), dim(a.description)]),
    ),
    bar(),
  ];
  u.send(out.join("\r\n"));
}

async function loadAmmo(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const [wName, aName] = arg.split("=").map((s) => s.trim());
  if (!wName || !aName) { u.send(`${ERR}Usage: +ammo/load <weapon>=<ammo>`); return; }
  const wep = getWeapon(wName);
  if (!wep) { u.send(`${ERR}Unknown weapon ${val(wName)}.`); return; }
  if (!ownedWeapons(cpr).some((g) => g.name === wep.name)) {
    u.send(`${ERR}You don't own a ${val(wep.name)}.`); return;
  }
  const amm = getAmmo(aName);
  if (!amm) { u.send(`${ERR}Unknown ammo ${val(aName)}.`); return; }
  if (!amm.weaponTypes.includes(wep.type)) {
    u.send(`${ERR}${val(amm.label)} ammo is not compatible with ${val(wep.name)}.`); return;
  }
  const loaded = { ...(cpr.ammoLoaded ?? {}), [wep.name]: amm.id };
  await u.db.modify(u.me.id, "$set", { "state.cpr.ammoLoaded": loaded });
  u.send(`${OK}Loaded ${acc(amm.label)} into ${val(wep.name)}.`);
}

async function buyAmmo(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const amm = getAmmo(arg);
  if (!amm) { u.send(`${ERR}Unknown ammo ${val(arg)}.`); return; }
  if (cpr.eurodollars < amm.costEb) {
    u.send(`${ERR}Insufficient eurodollars. Need ${val(amm.costEb + "eb")}.`); return;
  }
  const newPack: IGearItem = {
    id: crypto.randomUUID(),
    name: `${amm.id}_ammo_x${AMMO_PACK_SIZE}`,
    type: "ammo",
    slot: "carried",
    concealed: false,
    description: `${amm.label} ammunition, ${AMMO_PACK_SIZE} rounds.`,
  };
  const gear = [...(cpr.gear ?? []), newPack];
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -amm.costEb });
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": gear });
  u.send(`${OK}Bought ${acc(amm.label + " x" + AMMO_PACK_SIZE)} for ${val(amm.costEb + "eb")}.`);
}

