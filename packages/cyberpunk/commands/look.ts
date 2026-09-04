/**
 * look — Room and player look command, CPR display scheme.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

type IDBObj = IUrsamuSDK["me"];
import type { ICPRCharacter, IGearItem, ICyberware } from "../db/schemas.ts";
import {
  bar, div, hdr, val, acc, dim, bad, ylw, ARR, tbl,
} from "./chargen.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

const W = 78;
const INDENT = "  ";

function isStaff(obj: IDBObj): boolean {
  return obj.flags.has("admin") || obj.flags.has("wizard") || obj.flags.has("superuser");
}

function stripCodes(s: string): string {
  return s.replace(/%c[a-z]|%[rtnb]/gi, "");
}

/** Format idle time from lastCommand timestamp. */
function formatIdle(lastCmd: unknown): string {
  if (typeof lastCmd !== "number" || isNaN(lastCmd)) return " ---";
  const mins = Math.floor((Date.now() - lastCmd) / 60_000);
  const s = mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`;
  return s.padStart(4);
}

function wrapDesc(text: string): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const max = W - INDENT.length;
  for (const w of words) {
    if (!w) continue;
    if (line && line.length + 1 + w.length > max) {
      lines.push(INDENT + line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(INDENT + line);
  return lines;
}

// ── occupant row ──────────────────────────────────────────────────────────────

function occRow(occ: IDBObj, isSelf: boolean): string {
  const os = (occ.state ?? {}) as Record<string, unknown>;
  const staff = isStaff(occ);
  const star  = staff ? acc("*") : " ";
  const name  = (occ.name ?? "Unknown").slice(0, 16).padEnd(16);
  const nameStr = val(name);
  const idle  = formatIdle(os.lastCommand);
  const shortdesc = (os.shortdesc ?? (os as Record<string, unknown>).shortdesc) as string | undefined;
  const sdMaxLen  = W - 3 - 16 - 5; // star(1)+space(1)+space(1) + name(16) + idle(5) = 24

  let sdStr: string;
  if (shortdesc) {
    const plain = stripCodes(shortdesc);
    sdStr = plain.length > sdMaxLen
      ? shortdesc.slice(0, sdMaxLen - 1) + dim("…")
      : shortdesc;
  } else if (isSelf) {
    sdStr = dim("Use +shortdesc <desc> to set.");
  } else {
    sdStr = dim(">");
  }

  return ` ${star} ${nameStr}${idle}  ${sdStr}`;
}

// ── formatOccupants ───────────────────────────────────────────────────────────

async function formatOccupants(u: IUrsamuSDK, room: IDBObj): Promise<string[]> {
  const lines: string[] = [];
  const occupants: IDBObj[] = await u.db.search({
    location: room.id,
    flags: /player/i,
  }).catch(() =>
    (room.contents as IDBObj[]).filter((o) => o.flags?.has("player"))
  );

  for (const occ of occupants) {
    lines.push(occRow(occ, occ.id === u.me.id));
  }
  return lines;
}

// ── roomLook ──────────────────────────────────────────────────────────────────

async function roomLook(u: IUrsamuSDK, room: IDBObj): Promise<void> {
  const rs  = (room.state ?? {}) as Record<string, unknown>;
  const zone = rs.zone as string | undefined;
  const zoneSuffix = zone ? dim(` [${zone}]`) : "";
  const desc: string  = (rs.desc as string | undefined) ?? "";

  const lines: string[] = [
    bar(),
    hdr(room.name ?? "Unknown") + zoneSuffix,
    bar(),
  ];

  if (desc) {
    for (const l of wrapDesc(desc)) lines.push(l);
  }

  lines.push(div());
  lines.push(`  ${val("OCCUPANTS")}`);

  const occLines = await formatOccupants(u, room);
  for (const ol of occLines) lines.push(ol);

  lines.push(bar());
  u.send(lines.join("\r\n"));
}

// ── playerLook helpers ────────────────────────────────────────────────────────

// gear tbl columns: SLOT(8) + NAME(32) + TYPE(8) + FLAGS(4) + 3 gaps of 2 = 8+32+8+4+6 = 58 + 2 indent = 60 visible
// header uses hdrJoin which pads to 78 — fine.
const lc = (label: string, width: number) => ({ label, width });

function woundColor(ws: string): string {
  if (ws === "healthy")                       return acc(ws.toUpperCase());
  if (ws === "mortally" || ws === "dead")     return bad(ws.toUpperCase());
  return ylw(ws.toUpperCase());
}

function gearSlotLabel(slot: string): string {
  if (slot === "wielded") return acc("wielded");
  if (slot === "worn")    return val("worn");
  return dim("carried");
}

const GEAR_SLOT_ORDER: Record<string, number> = { wielded: 0, worn: 1, carried: 2 };

function sortGear(items: IGearItem[]): IGearItem[] {
  return [...items].sort(
    (a, b) => (GEAR_SLOT_ORDER[a.slot] ?? 9) - (GEAR_SLOT_ORDER[b.slot] ?? 9),
  );
}

// ── renderChrome ──────────────────────────────────────────────────────────────
// Column budget (2 indent + 76 content = 78 total):
//   NAME(34) + gap(2) + LOCATION(18) + gap(2) + SLOTS(12) + gap(2) + HL(6) = 76
// Child rows: 2 indent + 2 extra indent + "> " prefix + name padded to col 72 + HL(6) = 78

function slotStr(used: number, total: number): string {
  const s = `${used}/${total} slots`;
  return used >= total - 1 ? acc(s) : dim(s);
}

function foundationalRow(cw: ICyberware, used: number): string {
  const name = val(cw.name.slice(0, 34).padEnd(34));
  const loc  = cw.location ? dim(cw.location.slice(0, 18).padEnd(18)) : "".padEnd(18);
  const slots = cw.slots !== undefined ? slotStr(used, cw.slots).padEnd(12) : "".padEnd(12);
  const hl   = dim(`HL ${cw.hl}`);
  return `  ${name}  ${loc}  ${slots}  ${hl}`;
}

function standaloneRow(cw: ICyberware): string {
  const name = val(cw.name.slice(0, 34).padEnd(34));
  const loc  = cw.location ? dim(cw.location.slice(0, 18).padEnd(18)) : "".padEnd(18);
  const blank = "".padEnd(12);
  const hl   = dim(`HL ${cw.hl}`);
  return `  ${name}  ${loc}  ${blank}  ${hl}`;
}

function childRow(cw: ICyberware): string {
  // 2 indent + "  > " (4) + name + padding + "HL N"
  // Total visible: 2 + 4 + name_padded = fits to col 72 (6 for HL)
  const nameMax = 66; // 78 - 2 - 4 - 6 = 66
  const raw = `> ${cw.name}`;
  const padded = val(raw.slice(0, nameMax).padEnd(nameMax));
  const hl = dim(`HL ${cw.hl}`);
  return `    ${padded}${hl}`;
}

function renderChrome(cyberware: ICyberware[]): string[] {
  const lines: string[] = [];
  const foundational = cyberware.filter((cw) => !cw.installedIn);
  const children = cyberware.filter((cw) => !!cw.installedIn);

  for (const f of foundational) {
    const kids = children.filter((c) => c.installedIn === f.id);
    const used = kids.reduce((s, c) => s + (c.slotCost ?? 1), 0);
    if (f.slots !== undefined) {
      lines.push(foundationalRow(f, used));
    } else {
      lines.push(standaloneRow(f));
    }
    for (const child of kids) lines.push(childRow(child));
  }
  return lines;
}

// ── playerLook ────────────────────────────────────────────────────────────────

async function playerLook(u: IUrsamuSDK, target: IDBObj): Promise<void> {
  const ts         = (target.state ?? {}) as Record<string, unknown>;
  const cpr        = (ts.cpr ?? null) as ICPRCharacter | null;
  const desc       = (ts.desc as string | undefined) ?? "";
  const role       = cpr?.role ?? "";
  const woundState = cpr?.woundState ?? "healthy";

  const name = target.name ?? "Unknown";
  const plainTitle = role
    ? `>> ${name.toUpperCase()}  ::  ${role.toUpperCase()} <<`
    : `>> ${name.toUpperCase()} <<`;
  const pad = Math.max(0, Math.floor((W - plainTitle.length) / 2));
  const indent = " ".repeat(pad);

  const coloredTitle = role
    ? `${ylw(">>")} ${val(name.toUpperCase())}  ${ylw("::")}  ${val(role.toUpperCase())} ${ylw("<<")}`
    : `${ylw(">>")} ${val(name.toUpperCase())} ${ylw("<<")}`;

  const lines: string[] = [bar(), indent + coloredTitle, bar()];

  if (desc) for (const l of wrapDesc(desc)) lines.push(l);

  // ── STATUS ACCENT ──────────────────────────────────────────────────────────
  const rep = cpr?.reputation ?? 0;
  lines.push(div());
  lines.push(
    `  ${dim("WOUND")}  ${woundColor(woundState)}   ${dim("REP")}  ${val(String(rep))}`,
  );

  // ── EQUIPPED ──────────────────────────────────────────────────────────────
  lines.push(div());
  lines.push(`  ${val("//")} ${dim("EQUIPPED")}`);

  const canSeeHidden = await u.canEdit(u.me, target);
  const gearRows: string[][] = [];

  if (cpr?.armorBody) {
    const a = cpr.armorBody;
    gearRows.push([val("worn"), `${val(a.name)}  ${dim(`SP ${a.currentSp}/${a.sp}`)}`, val("armor"), ""]);
  }
  if (cpr?.armorHead) {
    const a = cpr.armorHead;
    gearRows.push([val("worn"), `${val(a.name)}  ${dim(`SP ${a.currentSp}/${a.sp}`)}`, val("armor"), ""]);
  }

  for (const item of sortGear(cpr?.gear ?? [])) {
    if (item.concealed && !canSeeHidden) continue;
    const flags   = item.concealed ? bad("[C]") : "";
    const nameStr = canSeeHidden
      ? `${val(item.name)}${dim(`(#${item.id.slice(0, 8)})`)}`
      : val(item.name);
    gearRows.push([gearSlotLabel(item.slot), nameStr, val(item.type), flags]);
  }

  if (gearRows.length === 0) {
    lines.push(`  ${dim("nothing equipped")}`);
  } else {
    // 2 indent + SLOT(8)+2 + NAME(48)+2 + TYPE(8)+2 + FLAGS(6) = 78
    lines.push(...tbl(
      [lc("SLOT", 8), lc("NAME", 48), lc("TYPE", 8), lc("FLAGS", 6)],
      gearRows,
    ));
  }

  // ── CYBERWARE ─────────────────────────────────────────────────────────────
  const cyberware = cpr?.cyberware ?? [];
  if (cyberware.length > 0) {
    lines.push(div());
    lines.push(`  ${val("//")} ${dim("CHROME")}`);
    for (const cwLine of renderChrome(cyberware)) lines.push(cwLine);
  }

  lines.push(bar());
  u.send(lines.join("\r\n"));
}

// ── command ───────────────────────────────────────────────────────────────────

addCmd({
  name: "look",
  pattern: /^look(?:\s+(.+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `look [<target>]  — Look at a room, object, or player.

Examples:
  look              Look at the current room.
  look Ghost        Look at a player or object named Ghost.
  look here         Look at the current room explicitly.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();

    if (!arg) {
      await roomLook(u, u.here);
      return;
    }

    const target = await u.util.target(u.me, arg, true);
    if (!target) {
      u.send(`${ARR}You don't see "${arg}" here.`);
      return;
    }

    if (target.flags.has("player")) {
      await playerLook(u, target);
    } else {
      await roomLook(u, target);
    }
  },
});
