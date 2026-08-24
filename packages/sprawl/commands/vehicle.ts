/** +vehicle +drive +chase — hulls, Metal Express mods, maneuvers. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  bad,
  header,
  dim,
  panelClose,
  panelOpen,
  good,
  divider,
  scan,
  val,
  ylw,
} from "./chrome.ts";
import {
  formatDice,
  gatherBonuses,
  resolveAction,
  applyResilience,
} from "../engine/action.ts";
import { woundGlitch } from "../engine/damage.ts";
import {
  getChar,
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
// getChar used by seat/eject for PC passengers
import {
  createItem,
  displayName,
  itemData,
  shortPartName,
} from "../engine/items.ts";
import {
  attachMod,
  detachMod,
  listHostMods,
  parseHostModArg,
} from "../engine/item-mods.ts";
import {
  boardVehicle,
  disembarkVehicle,
  effectiveVehicleDs,
  garageLines,
  getActiveVehicle,
  listOccupants,
  mintVehicle,
  ownedVehicles,
  resolveVehicleRef,
  seatOccupant,
  unseatOccupant,
  vehicleActionBonus,
  vehicleLabel,
  vehicleModSourceFromRow,
} from "../engine/vehicles.ts";
import {
  writeItemData,
} from "../engine/items.ts";
import {
  VEHICLES,
  VEHICLE_MODS,
  SHOWROOM,
  MECHANICS,
  METAL_EXPRESS,
  ANTAGONISTS,
  find,
  findByName,
} from "../engine/catalog.ts";

const MANEUVERS: { name: string; ds: number }[] = [
  { name: "traffic", ds: 8 },
  { name: "swerve", ds: 8 },
  { name: "hard-brake", ds: 10 },
  { name: "hover", ds: 10 },
  { name: "tight-turn", ds: 12 },
  { name: "drift", ds: 12 },
  { name: "bootlegger", ds: 14 },
  { name: "acrobatics", ds: 16 },
  { name: "stunt", ds: 18 },
  { name: "needle", ds: 20 },
];

function listCat(
  title: string,
  rows: { slug: string; name?: string; cost?: unknown }[],
  filter: string,
): string {
  const q = filter.toLowerCase();
  const hit = q
    ? rows.filter((r) =>
      r.slug.includes(q) ||
      String(r.name ?? "").toLowerCase().includes(q)
    )
    : rows;
  const lines = [header(title)];
  for (const r of hit.slice(0, 24)) {
    const cost = r.cost != null
      ? ` ${dim(String(r.cost) + " b¥")}`
      : "";
    lines.push(
      `  ${val(r.slug)} ${dim(String(r.name))}${cost}`,
    );
  }
  if (hit.length > 24) {
    lines.push(`  ${dim("… filter to narrow")}`);
  }
  lines.push(footer());
  return lines.join("\r\n");
}

addCmd({
  name: "+vehicle",
  pattern: /^\+vehicle(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+vehicle[/<switch>] [args]  — Garage, mods, Metal Express.

Hulls are Things (not personal load). Board one to drive.
Mods nest on the hull like weapon mods.

Switches:
  /garage|/list     Your hulls + crew
  /chassis [f]      Generic chassis + prices
  /showroom [f]     Named Metal Express hulls
  /mods [f]         Vehicle mod catalog
  /buy <slug>       Buy chassis or showroom hull
  /buymod <slug>    Buy loose vehicle-mod
  /board <ref>      You pilot (active ★ + seat)
  /stow             Leave active vehicle
  /crew <hull>      List who is aboard
  /seat <hull>=<npc|name/ds>
  /eject <hull>=<who>
  /mod <v>=<mod>    Attach vehicle-mod
  /unmod <v>=<mod>  Detach → loose
  /design /mechanic

Examples:
  +vehicle/buy ground-car
  +vehicle/seat car=driver/12
  +vehicle/seat car=genexus-agent
  +vehicle/board car
  +attack/auto car
  +drive tight-turn`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "garage").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const argLc = arg.toLowerCase();

    if (sw === "design") {
      const m = METAL_EXPRESS;
      u.send(
        [
          header("METAL EXPRESS"),
          `  ${dim(String(m.ramming))}`,
          `  ${dim(String(m.pedestrians))}`,
          `  ${dim(String(m.collisions))}`,
          `  Control: Reaction vs DS14 (dangerous)`,
          `  Repair: 10% of price per DS lost`,
          `  Abilities/bolt-ons: ${val("+vehicle/mods")}`,
          `  Mecha: tanksuit · walker + mecha-* mods`,
          footer()
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "showroom") {
      const lines = [header("SHOWROOM")];
      let n = 0;
      for (const v of SHOWROOM) {
        if (
          argLc &&
          !v.slug.includes(argLc) &&
          !String(v.name).toLowerCase().includes(argLc)
        ) {
          continue;
        }
        lines.push(
          `  ${val(String(v.slug))}` +
            ` DS${val(v.ds as number)}` +
            ` ${dim(String(v.cost) + " b¥")}`,
        );
        lines.push(`     ${dim(String(v.name))}`);
        n++;
        if (n >= 24) {
          lines.push(`  ${dim("… filter to see more")}`);
          break;
        }
      }
      if (!n) lines.push(`  ${dim("no match")}`);
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "chassis") {
      u.send(listCat("CHASSIS", VEHICLES, argLc));
      return;
    }

    if (sw === "mods" || sw === "catalog") {
      u.send(listCat("VEHICLE MODS", VEHICLE_MODS, argLc));
      return;
    }

    if (sw === "mechanic" || sw === "mechanics") {
      const lines = [header("MECHANICS FOR HIRE")];
      for (const m of MECHANICS) {
        lines.push(
          `  ${val(String(m.roll))} ${ylw(String(m.name))}`,
        );
        lines.push(`     ${dim(String(m.blurb))}`);
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "buy") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+vehicle/buy <slug>")}`,
        );
        return;
      }
      const row = find("showroom", arg) ??
        find("vehicle", arg) ??
        findByName([...SHOWROOM, ...VEHICLES], arg);
      if (!row) {
        u.send(`${ERR}Unknown hull. Try /showroom or /chassis.`);
        return;
      }
      const cost = Number(row.cost ?? 0);
      if (cost > 0 && c.bityuan < cost) {
        u.send(
          `${ERR}Need ${val(cost)} b¥ (have ${val(c.bityuan)}).`,
        );
        return;
      }
      const chassis = find("vehicle", row.slug)
        ? row.slug
        : find("showroom", row.slug)
        ? undefined
        : String(row.slug);
      const obj = await mintVehicle(u, u.me.id, row, {
        chassis: chassis ??
          (String(row.tags ?? "").toLowerCase().includes("tanksuit")
            ? "tanksuit"
            : undefined),
      });
      if (!obj) {
        u.send(`${ERR}Could not mint vehicle.`);
        return;
      }
      if (cost > 0) {
        await saveChar(u, {
          ...c,
          bityuan: c.bityuan - cost,
        });
      }
      u.send(
        `${OK}Garaged ${val(vehicleLabel(obj))}` +
          (cost
            ? ` (−${val(cost)} b¥)`
            : "") +
          ` — ${val("+vehicle/board " + row.slug)}`,
      );
      return;
    }

    if (sw === "buymod") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const row = find("vehicleMod", arg) ??
        findByName(VEHICLE_MODS, arg);
      if (!row) {
        u.send(`${ERR}Unknown vehicle mod.`);
        return;
      }
      const cost = Number(row.cost ?? 0);
      if (cost > 0 && c.bityuan < cost) {
        u.send(`${ERR}Need ${val(cost)} b¥.`);
        return;
      }
      const obj = await createItem(
        u,
        u.me.id,
        vehicleModSourceFromRow(row),
      );
      if (!obj) {
        u.send(`${ERR}Could not mint mod.`);
        return;
      }
      if (cost > 0) {
        await saveChar(u, {
          ...c,
          bityuan: c.bityuan - cost,
        });
      }
      u.send(
        `${OK}Bought ${val(displayName(obj))}` +
          ` — ${val("+vehicle/mod <hull>=" + row.slug)}`,
      );
      return;
    }

    if (sw === "board" || sw === "pilot" || sw === "ride") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const v = await resolveVehicleRef(u, u.me.id, arg);
      if (!v) {
        u.send(`${ERR}Not in garage. ${val("+vehicle")}`);
        return;
      }
      await boardVehicle(u, c, v, u.me, "driver");
      u.send(
        `${OK}Boarded ${val(vehicleLabel(v))}` +
          ` as driver — drive ready.`,
      );
      return;
    }

    if (sw === "stow" || sw === "leave" || sw === "disembark") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (!c.activeVehicleId) {
        u.send(`${ARR}Not aboard anything.`);
        return;
      }
      await disembarkVehicle(u, c, u.me);
      u.send(`${OK}Left the vehicle.`);
      return;
    }

    if (sw === "crew") {
      const v = await resolveVehicleRef(u, u.me.id, arg);
      if (!v) {
        u.send(`${ERR}Hull not in garage.`);
        return;
      }
      const seats = listOccupants(itemData(v));
      u.send(
        [
          header(`CREW — ${displayName(v)}`),
          ...(seats.length
            ? seats.map((s) => `  ${s}`)
            : [`  ${dim("empty")}`]),
          `  ${dim("+vehicle/seat hull=name/ds · /eject")}`,
          footer()
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "seat" || sw === "embark") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send(
          `${ERR}Usage: ${val("+vehicle/seat <hull>=<who>")}` +
            `\r\n  who: name/ds · antagonist slug · player`,
        );
        return;
      }
      const href = arg.slice(0, eq).trim();
      const who = arg.slice(eq + 1).trim();
      const v = await resolveVehicleRef(u, u.me.id, href);
      if (!v) {
        u.send(`${ERR}Hull not in garage.`);
        return;
      }
      const d = itemData(v);
      if (!d) {
        u.send(`${ERR}Not a vehicle.`);
        return;
      }
      const occ = await parseSeatWho(u, who);
      if (!occ) {
        u.send(
          `${ERR}Need name/ds, NPC slug, or player name.`,
        );
        return;
      }
      // PCs: boardVehicle writes seat + activeVehicleId.
      if (occ.pc && occ.id) {
        const target = await u.util.target(u.me, occ.name, true);
        const tc = target ? getChar(target) : null;
        if (tc && target) {
          await boardVehicle(
            u,
            tc,
            v,
            target,
            occ.role ?? "passenger",
          );
        } else {
          await writeItemData(u, v, seatOccupant(d, occ));
        }
      } else {
        await writeItemData(u, v, seatOccupant(d, occ));
      }
      u.send(
        `${OK}Seated ${val(occ.name)}` +
          ` on ${val(displayName(v))}` +
          (occ.pc ? " (PC)" : ` DS${val(occ.ds)}`),
      );
      return;
    }

    if (sw === "eject" || sw === "unseat") {
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send(
          `${ERR}Usage: ${val("+vehicle/eject <hull>=<who>")}`,
        );
        return;
      }
      const href = arg.slice(0, eq).trim();
      const who = arg.slice(eq + 1).trim();
      const v = await resolveVehicleRef(u, u.me.id, href);
      if (!v) {
        u.send(`${ERR}Hull not in garage.`);
        return;
      }
      const d = itemData(v);
      if (!d) {
        u.send(`${ERR}Not a vehicle.`);
        return;
      }
      const { data, removed } = unseatOccupant(d, who);
      if (!removed) {
        u.send(`${ERR}Nobody matching ${val(who)} aboard.`);
        return;
      }
      await writeItemData(u, v, data);
      if (removed.pc && removed.id) {
        const pool = await u.db.search({}) as typeof u.me[];
        const pl = pool.find((o) => o.id === removed.id);
        const pc = pl ? getChar(pl) : null;
        if (pc && pl && pc.activeVehicleId === v.id) {
          await disembarkVehicle(u, pc, pl);
        }
      }
      u.send(
        `${OK}Ejected ${val(removed.name)}` +
          ` from ${val(displayName(v))}.`,
      );
      return;
    }

    if (sw === "mod") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const parsed = parseHostModArg(arg);
      if (!parsed) {
        u.send(
          `${ERR}Usage: ${val("+vehicle/mod <hull>=<mod>")}`,
        );
        return;
      }
      if (!parsed.mod) {
        const host = await resolveVehicleRef(
          u,
          u.me.id,
          parsed.host,
        );
        if (!host) {
          u.send(`${ERR}Hull not in garage.`);
          return;
        }
        const mods = listHostMods(host);
        u.send(
          [
            header(`MODS — ${displayName(host)}`),
            ...(mods.length
              ? mods.map((m) => `  ${val(m)}`)
              : [`  ${dim("none")}`]),
            `  ${dim("DS " + (effectiveVehicleDs(itemData(host)!) ?? "?"))}`,
            footer()
          ].join("\r\n"),
        );
        return;
      }
      const r = await attachMod(
        u,
        u.me.id,
        parsed.host,
        parsed.mod,
        { vehicle: true },
      );
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      u.send(
        `${OK}Installed ${val(r.modName)}` +
          ` → ${val(vehicleLabel(r.host))}`,
      );
      return;
    }

    if (sw === "unmod") {
      const parsed = parseHostModArg(arg);
      if (!parsed?.mod) {
        u.send(
          `${ERR}Usage: ${val("+vehicle/unmod <hull>=<mod>")}`,
        );
        return;
      }
      const r = await detachMod(
        u,
        u.me.id,
        parsed.host,
        parsed.mod,
        { vehicle: true },
      );
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      u.send(
        `${OK}Removed ${val(r.modName)}` +
          ` from ${val(displayName(r.host))}`,
      );
      return;
    }

    // garage / list / default
    const c = getChar(u.me);
    const list = await ownedVehicles(u, u.me.id);
    const active = c?.activeVehicleId;
    const lines = [
      header("GARAGE"),
      ...garageLines(list, active),
      `  ${dim(
        "+vehicle/buy · /board · /seat · /crew · /mod · +drive",
      )}`,
      header(),
    ];
    u.send(lines.join("\r\n"));
  },
});

/** Parse seat who: "Name/12", antagonist slug, or player. */
async function parseSeatWho(
  u: IUrsamuSDK,
  raw: string,
): Promise<{
  name: string;
  ds: number;
  id?: string;
  role?: string;
  slug?: string;
  pc?: boolean;
} | null> {
  const s = raw.trim();
  if (!s) return null;

  // name/ds or role:name/ds
  const m = s.match(
    /^(?:(driver|passenger|gunner|pilot):)?(.+?)\/(\d+)$/i,
  );
  if (m) {
    return {
      name: m[2].trim(),
      ds: Number(m[3]),
      role: m[1]?.toLowerCase() ?? "passenger",
    };
  }

  const npc = find("antagonist", s.toLowerCase()) ??
    findByName(ANTAGONISTS, s) ??
    ANTAGONISTS.find((a) => a.slug === s.toLowerCase());
  if (npc && typeof npc.ds === "number") {
    return {
      name: String(npc.name ?? npc.slug),
      ds: npc.ds as number,
      slug: npc.slug,
      role: "passenger",
    };
  }

  const pl = await u.util.target(u.me, s, true);
  if (pl) {
    const ch = getChar(pl);
    if (ch?.chargenComplete) {
      return {
        name: String(pl.name ?? ch.name),
        ds: ch.resilience,
        id: pl.id,
        role: "passenger",
        pc: true,
      };
    }
  }
  return null;
}

addCmd({
  name: "+drive",
  pattern: /^\+drive\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+drive <maneuver|ds> [+upgrade|+glitch]
  — Reaction + boarded vehicle mods vs maneuver DS.

Maneuvers: traffic swerve hard-brake hover tight-turn
  drift bootlegger acrobatics stunt needle

Examples:
  +vehicle/board rider
  +drive tight-turn
  +drive 14 +upgrade`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!raw) {
      u.send(`${ERR}Usage: ${val("+drive <maneuver|ds>")}`);
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const [head, ...rest] = raw.toLowerCase().split(/\s+/);
    let ds = Number(head);
    let label = `DS${head}`;
    if (!Number.isFinite(ds)) {
      const m = MANEUVERS.find((x) =>
        x.name === head || x.name.startsWith(head)
      );
      if (!m) {
        u.send(
          `${ERR}Unknown maneuver. Try ${val("+drive traffic")}.`,
        );
        return;
      }
      ds = m.ds;
      label = m.name;
    }
    let glitch = woundGlitch(c);
    let upgrade = 0;
    for (const t of rest) {
      if (t === "+glitch" || t === "glitch") glitch++;
      if (t === "+upgrade" || t === "upgrade") upgrade++;
    }
    const { items, load } = await getInventory(u, u.me);
    const ride = await getActiveVehicle(u, u.me, c);
    const vd = ride ? itemData(ride) : null;
    const vbon = vehicleActionBonus(vd, ["drive"]);
    const gath = gatherBonuses(
      c,
      "reaction",
      vbon.total,
      [
        ...(ride
          ? [
            shortPartName(
              displayName(ride),
              vd?.slug ?? vd?.chassis,
            ),
          ]
          : []),
        ...vbon.parts,
      ],
      load,
      items,
    );
    const result = resolveAction({
      stat: "reaction",
      statValue: c.stats.reaction,
      bonuses: gath.total,
      ds,
      glitch,
      upgrade: upgrade + vbon.upgrade,
      dangerous: true,
    });
    let sheet = c;
    if (result.damageToSelf > 0) {
      sheet = applyResilience(sheet, -result.damageToSelf);
      await saveChar(u, sheet);
    }
    const outcome = result.success ? good("HOLD") : bad("CRASH");
    const hullDs = vd ? effectiveVehicleDs(vd) : null;
    const dice = result.dice;
    const diceS = `[${dice.dice.join("+")}]→${dice.kept[0]}+${
      dice.kept[1]
    }` +
      (dice.mode !== "normal"
        ? ` ${dice.mode === "upgrade" ? "upg" : dice.mode}`
        : "");
    u.send(
      [
        panelOpen("DRIVE", label),
        `  REA ${val(c.stats.reaction)}` +
        (gath.total ? ` +${val(gath.total)}` : "") +
        ` ${dim(diceS)}  ` +
        `${val(result.total)} vs ${val(ds)} → ${outcome}`,
        gath.parts.length
          ? `  ${dim(gath.parts.join(" · "))}`
          : `  ${dim(ride ? "no veh mods" : "on foot")}`,
        hullDs != null ? `  Hull DS${val(hullDs)}` : "",
        result.damageToSelf
          ? `  ${bad("-" + result.damageToSelf)} Res`
          : "",
        panelClose("WHEELS"),
      ].filter(Boolean).join("\r\n"),
    );
  },
});

addCmd({
  name: "+chase",
  pattern: /^\+chase\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+chase <opponent-ds> [lead] [+upgrade|+glitch]
  — Chase round. Crazy Fast / Turbo → +2 faster.

Examples:
  +chase 12
  +chase 14 2 +upgrade`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const parts = raw.split(/\s+/);
    const base = Number(parts[0]);
    if (!Number.isFinite(base)) {
      u.send(`${ERR}Usage: ${val("+chase <ds> [lead]")}`);
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    let lead = 0;
    let glitch = woundGlitch(c);
    let upgrade = 0;
    let faster = 0;
    for (const t of parts.slice(1)) {
      if (/^-?\d+$/.test(t)) lead = Number(t);
      else if (t === "+fast" || t === "faster") faster = 2;
      else if (t === "+glitch" || t === "glitch") glitch++;
      else if (t === "+upgrade" || t === "upgrade") upgrade++;
    }
    const { items, load: cLoad } = await getInventory(u, u.me);
    const ride = await getActiveVehicle(u, u.me, c);
    const vd = ride ? itemData(ride) : null;
    const vbon = vehicleActionBonus(vd, ["chase", "drive"]);
    if (vbon.faster && !faster) faster = 2;
    const bonus = faster + Math.max(0, lead) + vbon.total;
    const gath = gatherBonuses(c, "reaction", bonus, [
      ...(faster ? ["faster +2"] : []),
      ...(lead > 0 ? [`lead +${lead}`] : []),
      ...(lead < 0 ? [`behind ${lead}`] : []),
      ...vbon.parts,
    ], cLoad, items);
    const result = resolveAction({
      stat: "reaction",
      statValue: c.stats.reaction,
      bonuses: gath.total + (lead < 0 ? lead : 0),
      ds: base,
      glitch,
      upgrade: upgrade + vbon.upgrade,
      dangerous: true,
    });
    const outcome = result.success
      ? good("GAIN LEAD")
      : bad("LOSE GROUND");
    u.send(
      [
        panelOpen("CHASE", `DS${base}`),
        scan(),
        `  Total ${val(result.total)} → ${outcome}`,
        `  Dice ${dim(formatDice(result.dice))}`,
        gath.parts.length
          ? `  Mods ${dim(gath.parts.join(", "))}`
          : "",
        `  Suggested next lead: ` +
        val(result.success ? lead + 1 : lead - 1),
        panelClose("PURSUIT"),
      ].filter(Boolean).join("\r\n"),
    );
  },
});

