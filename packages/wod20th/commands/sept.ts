// commands/sept.ts -- +sept for sept membership, leadership, and roster.
//
// Canon: a sept is the society that forms around a caern (W20 p. 55).
// Sept-level positions (Sept Leader, Master of the Rite, Talesinger,
// Caller of the Wyld, Truthcatcher, Warder, Den Mother, Wyrm Foe, etc.)
// live here. The caern itself is the spiritual node and lives in
// db/caernDb.ts; the sept HAS its caern via sept.caernId.
//
// Members are reached transitively: char.packId -> pack -> sept.packIds.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findById, findByPlayer } from "../db/charDb.ts";
import { findPackById, findPackByName } from "../db/packDb.ts";
import { findCaernById, findCaernByName } from "../db/caernDb.ts";
import {
  createSept,
  deleteSept,
  findAllSepts,
  findSeptByCaern,
  findSeptById,
  findSeptByName,
  findSeptByPack,
  saveSept,
  type ISept,
} from "../db/septDb.ts";
import { divider, footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function rankLabel(rank: number | undefined): string {
  if (!rank) return "-";
  const names = ["", "Cliath", "Fostern", "Adren", "Athro", "Elder"];
  return `${rank} ${names[rank] ?? ""}`.trim();
}

function titleCase(s: string | undefined): string {
  if (!s) return "-";
  return s[0].toUpperCase() + s.slice(1);
}

async function renderInfo(sept: ISept): Promise<string> {
  const lines: string[] = [
    header(`Sept: ${sept.name}`),
    `  Packs:    ${sept.packIds.length}`,
  ];
  if (sept.caernId) {
    const c = await findCaernById(sept.caernId);
    lines.push(`  Caern:    ${c ? `${c.name} (L${c.level} ${c.type})` : "(missing)"}`);
  } else {
    lines.push(`  Caern:    (unbound)`);
  }
  if (sept.leader) {
    const lc = await findById(sept.leader);
    lines.push(`  Sept Alpha: ${lc ? (lc.moniker || lc.fullName || lc.deedName || sept.leader) : `(missing ${sept.leader})`}`);
  }
  if (Object.keys(sept.positions).length > 0) {
    lines.push(divider("Positions"));
    for (const [cid, pos] of Object.entries(sept.positions)) {
      const c = await findById(cid);
      const name = c ? (c.moniker || c.fullName || c.deedName || cid) : `(missing)`;
      lines.push(`  %ch${pos.padEnd(22)}%cn ${name}`);
    }
  }
  if (sept.notes.length > 0) {
    lines.push(divider("Notes"));
    for (const n of sept.notes) lines.push(`  - ${n}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderList(septs: ISept[]): Promise<string> {
  const lines: string[] = [header("Septs")];
  if (septs.length === 0) {
    lines.push("  (No septs recorded.)");
  } else {
    for (const s of septs) {
      const c = s.caernId ? await findCaernById(s.caernId) : null;
      lines.push(`  %ch${s.name.padEnd(28)}%cn  ${s.packIds.length} pack(s)` +
        (c ? `   Caern: ${c.name} (L${c.level})` : "   (no caern)"));
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

/** Parsed roster RHS modifiers ("sort:rank,auspice:galliard,pack:iron"). */
interface IRosterOpts {
  sort?: "name" | "rank" | "auspice" | "breed" | "pack" | "position";
  filterAuspice?: string;
  filterBreed?: string;
  filterPack?: string;
  filterPosition?: string;
  filterTribe?: string;
}

const ROSTER_SORTS = new Set(["name", "rank", "auspice", "breed", "pack", "position"]);

function parseRosterOpts(rhs: string): IRosterOpts | string {
  const out: IRosterOpts = {};
  if (!rhs) return out;
  for (const raw of rhs.split(",")) {
    const seg = raw.trim();
    if (!seg) continue;
    const colon = seg.indexOf(":");
    if (colon < 0) return `Bad option "${seg}" (expected key:value).`;
    const key = seg.slice(0, colon).trim().toLowerCase();
    const val = seg.slice(colon + 1).trim();
    if (!val) return `Empty value for "${key}".`;
    switch (key) {
      case "sort":
        if (!ROSTER_SORTS.has(val.toLowerCase())) {
          return `Unknown sort field: ${val}. Use name|rank|auspice|breed|pack|position.`;
        }
        out.sort = val.toLowerCase() as IRosterOpts["sort"];
        break;
      case "auspice":  out.filterAuspice  = val.toLowerCase(); break;
      case "breed":    out.filterBreed    = val.toLowerCase(); break;
      case "pack":     out.filterPack     = val.toLowerCase(); break;
      case "position": out.filterPosition = val.toLowerCase(); break;
      case "tribe":    out.filterTribe    = val.toLowerCase(); break;
      default: return `Unknown roster option: ${key}.`;
    }
  }
  return out;
}

interface IRosterRow {
  charId: string;
  name: string;
  rank: number;
  auspice: string;
  breed: string;
  tribe: string;
  /** Used for filter only; not rendered as a column. */
  packName: string;
  position: string;
  isAlpha: boolean;
  /** Sept Alpha (sept leader). */
  isLeader: boolean;
}

/**
 * Flat roster: one row per sept member. Pack is a column rather than a
 * grouping. Supports sort + filter via IRosterOpts.
 */
async function renderRoster(sept: ISept, opts: IRosterOpts): Promise<string> {
  const lines: string[] = [header(`Sept Roster: ${sept.name}`)];

  if (sept.caernId) {
    const c = await findCaernById(sept.caernId);
    if (c) lines.push(`  %chCaern:%cn ${c.name}   L${c.level} ${c.type}`);
  }
  if (sept.leader) {
    const lc = await findById(sept.leader);
    if (lc) {
      lines.push(`  %chSept Alpha:%cn ${lc.moniker || lc.fullName || lc.deedName || sept.leader}`);
    }
  }

  // Collect rows.
  const rows: IRosterRow[] = [];
  for (const pid of sept.packIds) {
    const pack = await findPackById(pid);
    if (!pack) continue;
    for (const cid of pack.members) {
      const c = await findById(cid);
      if (!c) continue;
      rows.push({
        charId: cid,
        name: c.moniker || c.fullName || c.deedName || cid,
        rank: c.rank ?? 0,
        auspice: (c.auspice ?? "").toLowerCase(),
        breed: (c.breed ?? "").toLowerCase(),
        tribe: (c.tribe ?? "").toLowerCase(),
        packName: pack.name,
        position: sept.positions[cid] ?? "",
        isAlpha: pack.alpha === cid,
        isLeader: sept.leader === cid,
      });
    }
  }

  // Filter.
  const filtered = rows.filter((r) => {
    if (opts.filterAuspice  && r.auspice  !== opts.filterAuspice)  return false;
    if (opts.filterBreed    && r.breed    !== opts.filterBreed)    return false;
    if (opts.filterTribe    && r.tribe    !== opts.filterTribe)    return false;
    if (opts.filterPack     && r.packName.toLowerCase() !== opts.filterPack) return false;
    if (opts.filterPosition && !r.position.toLowerCase().includes(opts.filterPosition)) return false;
    return true;
  });

  // Sort.
  const sortKey = opts.sort ?? "rank";
  filtered.sort((a, b) => {
    if (sortKey === "rank") return b.rank - a.rank; // high rank first
    if (sortKey === "name") return a.name.localeCompare(b.name);
    if (sortKey === "auspice") return a.auspice.localeCompare(b.auspice);
    if (sortKey === "breed") return a.breed.localeCompare(b.breed);
    if (sortKey === "pack") return a.packName.localeCompare(b.packName);
    if (sortKey === "position") return a.position.localeCompare(b.position);
    return 0;
  });

  // Render.
  const modSummary: string[] = [];
  if (opts.sort) modSummary.push(`sort:${opts.sort}`);
  if (opts.filterAuspice)  modSummary.push(`auspice:${opts.filterAuspice}`);
  if (opts.filterBreed)    modSummary.push(`breed:${opts.filterBreed}`);
  if (opts.filterTribe)    modSummary.push(`tribe:${opts.filterTribe}`);
  if (opts.filterPack)     modSummary.push(`pack:${opts.filterPack}`);
  if (opts.filterPosition) modSummary.push(`position:${opts.filterPosition}`);
  lines.push(divider(
    modSummary.length ? `Members (${modSummary.join(", ")})` : "Members",
  ));

  if (filtered.length === 0) {
    lines.push(rows.length === 0
      ? "  (No members in this sept.)"
      : "  (No members match the filter.)");
    lines.push(footer());
    return lines.join("%r");
  }

  // Column widths (visible). 2 prefix + 24 + 12 + 12 + 10 = 60, leaving
  // 18 chars for Position before hitting the 78-col limit. Long canon
  // positions like "Master of the Rite" / "Caller of the Wyld" = 18.
  const COL = { name: 24, rank: 12, auspice: 12, breed: 10 };
  const MAX_POSITION = 78 - 2 - COL.name - COL.rank - COL.auspice - COL.breed; // 18
  lines.push("  " +
    "Name".padEnd(COL.name) +
    "Rank".padEnd(COL.rank) +
    "Auspice".padEnd(COL.auspice) +
    "Breed".padEnd(COL.breed) +
    "Position");
  for (const r of filtered) {
    // Pack alpha is not annotated in the sept roster -- pack is no longer
    // a column here and Sept Alpha rides in the Position column instead.
    const baseName = r.name.length > COL.name
      ? r.name.slice(0, COL.name - 1) + "…"
      : r.name;
    const namePadded = baseName.padEnd(COL.name);
    // Position column: combine Sept Alpha status with any explicit
    // position. "Sept Alpha" alone, "Sept Alpha, <pos>" when both,
    // "-" when neither. Truncated to MAX_POSITION chars.
    let positionRaw: string;
    if (r.isLeader && r.position) {
      positionRaw = `Sept Alpha, ${r.position}`;
    } else if (r.isLeader) {
      positionRaw = "Sept Alpha";
    } else {
      positionRaw = r.position || "-";
    }
    const positionTrim = positionRaw.length > MAX_POSITION
      ? positionRaw.slice(0, MAX_POSITION - 1) + "…"
      : positionRaw;
    lines.push("  " +
      namePadded +
      rankLabel(r.rank).padEnd(COL.rank) +
      titleCase(r.auspice).padEnd(COL.auspice) +
      titleCase(r.breed).padEnd(COL.breed) +
      positionTrim);
  }
  lines.push(`  (${filtered.length}/${rows.length} shown)`);
  lines.push(footer());
  return lines.join("%r");
}

/** Permission helper: sept leader or staff. */
async function isSeptAuthority(u: IUrsamuSDK, sept: ISept): Promise<boolean> {
  if (isStaff(u)) return true;
  const char = await findByPlayer(u.me.id);
  return !!char && sept.leader === char.id;
}

addCmd({
  name: "+sept",
  pattern: /^\+sept(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+sept[/switch] [<args>]  — Sept membership and roster.

  List, join, roster, positions; staff create/bind/alpha.

  Full help: +help sept

Examples:
  +sept
  +sept/roster My Sept=sort:rank
  +sept/join Sept of the Pines`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list ----------------------------------------------------------------
    if (sw === "list") {
      u.send(await renderList(await findAllSepts()));
      return;
    }

    // -- /info ----------------------------------------------------------------
    if (sw === "info") {
      if (!arg) { u.send("Usage: +sept/info <name>"); return; }
      const s = await findSeptByName(arg);
      if (!s) { u.send(`No sept named "${arg}".`); return; }
      u.send(await renderInfo(s));
      return;
    }

    // -- /roster [<name>][=<sort:..,filter:..>] ------------------------------
    if (sw === "roster") {
      // LHS = sept name (single key); RHS = comma-separated key:val opts.
      let septName = arg;
      let rhs = "";
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        septName = arg.slice(0, eq).trim();
        rhs = arg.slice(eq + 1).trim();
      }
      const parsed = parseRosterOpts(rhs);
      if (typeof parsed === "string") { u.send(`%cr${parsed}%cn`); return; }

      let sept: ISept | null = null;
      if (septName) {
        sept = await findSeptByName(septName);
        if (!sept) { u.send(`No sept named "${septName}".`); return; }
      } else {
        const char = await findByPlayer(u.me.id);
        if (char?.packId) sept = await findSeptByPack(char.packId);
        if (!sept) {
          u.send("You are not in a sept. Use +sept/roster <name>.");
          return;
        }
      }
      u.send(await renderRoster(sept, parsed));
      return;
    }

    // -- /create <name>  (staff) ---------------------------------------------
    if (sw === "create") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +sept/create <name>"); return; }
      const existing = await findSeptByName(arg);
      if (existing) { u.send(`A sept named "${existing.name}" already exists.`); return; }
      const sept = await createSept(arg.trim());
      u.send(`%cgSept "${sept.name}" founded.%cn`);
      return;
    }

    // -- /bind <sept>/<caern>  (staff) ---------------------------------------
    if (sw === "bind") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      // Slash-key form: <sept>/<caern> (no value).
      const slashIdx = arg.lastIndexOf("/");
      if (slashIdx < 0) { u.send("Usage: +sept/bind <sept>/<caern>"); return; }
      const sname = arg.slice(0, slashIdx).trim();
      const cname = arg.slice(slashIdx + 1).trim();
      if (!sname || !cname) { u.send("Usage: +sept/bind <sept>/<caern>"); return; }
      const sept = await findSeptByName(sname);
      if (!sept) { u.send(`No sept named "${sname}".`); return; }
      const caern = await findCaernByName(cname);
      if (!caern) { u.send(`No caern named "${cname}".`); return; }
      // Reject if the caern is bound to a different sept already.
      const other = await findSeptByCaern(caern.id);
      if (other && other.id !== sept.id) {
        u.send(`%crCaern "${caern.name}" is already bound to sept "${other.name}".%cn`);
        return;
      }
      sept.caernId = caern.id;
      await saveSept(sept);
      u.send(`%cgSept "${sept.name}" bound to caern "${caern.name}".%cn`);
      return;
    }

    // -- /join <sept>  (alpha or staff) --------------------------------------
    if (sw === "join") {
      if (!arg) { u.send("Usage: +sept/join <sept>"); return; }
      const sept = await findSeptByName(arg);
      if (!sept) { u.send(`No sept named "${arg}".`); return; }
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
      if (pack.alpha !== char.id && !isStaff(u)) {
        u.send("Only the pack alpha (or staff) may bring a pack into a sept.");
        return;
      }
      if (sept.packIds.includes(pack.id)) {
        u.send(`Pack "${pack.name}" is already in sept "${sept.name}".`);
        return;
      }
      // Pull from any prior sept first (a pack belongs to one sept at a time).
      const prior = await findSeptByPack(pack.id);
      if (prior && prior.id !== sept.id) {
        prior.packIds = prior.packIds.filter((p) => p !== pack.id);
        await saveSept(prior);
      }
      sept.packIds = [...sept.packIds, pack.id];
      await saveSept(sept);
      u.send(`%cgPack "${pack.name}" joins sept "${sept.name}".%cn`);
      return;
    }

    // -- /leave  (alpha) -----------------------------------------------------
    if (sw === "leave") {
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (!char.packId) { u.send("You are not in a pack."); return; }
      const pack = await findPackById(char.packId);
      if (!pack) { u.send("Your pack record is missing -- ask staff."); return; }
      if (pack.alpha !== char.id && !isStaff(u)) {
        u.send("Only the pack alpha (or staff) may withdraw a pack."); return;
      }
      const sept = await findSeptByPack(pack.id);
      if (!sept) { u.send(`Pack "${pack.name}" is not in a sept.`); return; }
      sept.packIds = sept.packIds.filter((p) => p !== pack.id);
      await saveSept(sept);
      u.send(`%cyPack "${pack.name}" withdraws from sept "${sept.name}".%cn`);
      return;
    }

    // -- /alpha <sept>=<player>  (staff) -------------------------------------
    //   Sets the Sept Alpha. /leader is kept as an alias for back-compat.
    if (sw === "alpha" || sw === "leader") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) { u.send("Usage: +sept/alpha <sept>=<player>"); return; }
      const sname = arg.slice(0, eqIdx).trim();
      const pname = arg.slice(eqIdx + 1).trim();
      if (!sname || !pname) { u.send("Usage: +sept/alpha <sept>=<player>"); return; }
      const sept = await findSeptByName(sname);
      if (!sept) { u.send(`No sept named "${sname}".`); return; }
      const target = await u.util.target(u.me, pname, true);
      if (!target) { u.send(`Player "${pname}" not found.`); return; }
      const tchar = await findByPlayer(target.id);
      if (!tchar) {
        u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return;
      }
      sept.leader = tchar.id;
      await saveSept(sept);
      u.send(`%cgSept Alpha of "${sept.name}" is now ${u.util.displayName(target, u.me)}.%cn`);
      return;
    }

    // -- /position + /unposition  (leader or staff) --------------------------
    //
    // Slash-key form per CLAUDE.md "Command shape":
    //   +sept/position <sept>/<player>=<position>
    //   +sept/unposition <sept>/<player>
    if (sw === "position" || sw === "unposition") {
      const setting = sw === "position";
      let lhs = arg;
      let posRaw = "";
      if (setting) {
        const eq = arg.indexOf("=");
        if (eq < 0) {
          u.send("Usage: +sept/position <sept>/<player>=<position>");
          return;
        }
        lhs = arg.slice(0, eq).trim();
        posRaw = arg.slice(eq + 1).trim();
        if (!posRaw) {
          u.send("Usage: +sept/position <sept>/<player>=<position>");
          return;
        }
      }
      const slashIdx = lhs.lastIndexOf("/");
      if (slashIdx < 0) {
        u.send(setting
          ? "Usage: +sept/position <sept>/<player>=<position>"
          : "Usage: +sept/unposition <sept>/<player>");
        return;
      }
      const sname = lhs.slice(0, slashIdx).trim();
      const pname = lhs.slice(slashIdx + 1).trim();
      if (!sname || !pname) {
        u.send(setting
          ? "Usage: +sept/position <sept>/<player>=<position>"
          : "Usage: +sept/unposition <sept>/<player>");
        return;
      }
      const sept = await findSeptByName(sname);
      if (!sept) { u.send(`No sept named "${sname}".`); return; }
      if (!await isSeptAuthority(u, sept)) {
        u.send("Only the sept leader (or staff) may set positions.");
        return;
      }
      const target = await u.util.target(u.me, pname, true);
      if (!target) { u.send(`Player "${pname}" not found.`); return; }
      const tchar = await findByPlayer(target.id);
      if (!tchar) {
        u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return;
      }
      if (setting) {
        sept.positions[tchar.id] = posRaw;
        await saveSept(sept);
        u.send(`%cgPosition set: ${u.util.displayName(target, u.me)} is %ch${posRaw}%cn%cg in "${sept.name}".%cn`);
      } else {
        if (!sept.positions[tchar.id]) {
          u.send(`${u.util.displayName(target, u.me)} holds no position in "${sept.name}".`); return;
        }
        delete sept.positions[tchar.id];
        await saveSept(sept);
        u.send(`%cyCleared position for ${u.util.displayName(target, u.me)} in "${sept.name}".%cn`);
      }
      return;
    }

    // -- /disband <name>  (staff) --------------------------------------------
    if (sw === "disband") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +sept/disband <name>"); return; }
      const sept = await findSeptByName(arg);
      if (!sept) { u.send(`No sept named "${arg}".`); return; }
      if (sept.packIds.length > 0) {
        u.send(`%crSept "${sept.name}" still has ${sept.packIds.length} pack(s). ` +
          `Have them /leave first.%cn`);
        return;
      }
      await deleteSept(sept.id);
      u.send(`%cySept "${sept.name}" disbanded.%cn`);
      return;
    }

    if (sw) { u.send(`Unknown switch /${sw}. See +help sept.`); return; }

    // No switch -- show actor's sept.
    const char = await findByPlayer(u.me.id);
    if (!char || !char.packId) {
      u.send("You are not in a sept (not in a pack). Use +sept/list to browse.");
      return;
    }
    const sept = await findSeptByPack(char.packId);
    if (!sept) {
      u.send("Your pack is not affiliated with a sept. Use +sept/list to browse.");
      return;
    }
    u.send(await renderInfo(sept));
  },
});

// Re-export for findSeptById in case other modules need it.
export { findSeptById };
