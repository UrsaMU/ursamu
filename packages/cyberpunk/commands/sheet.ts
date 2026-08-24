/**
 * +sheet -- Character Sheet Display
 * +score -- Compact stat summary
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import type { ICPRCharacter, WoundState } from "../db/schemas.ts";
import { skillDisplayName } from "../data/skills.ts";
import { getRole } from "../data/roles.ts";
import { cyberpsychosisSeverity } from "../engine/cyberpsychosis.ts";
import { totalDeathSavePenalty, woundActionPenalty, woundMovePenalty } from "../engine/character.ts";
import { ensureStunPool, isUnconscious } from "../engine/stun.ts";
import { LIFESTYLES } from "../data/lifestyles.ts";
import { bar, div, hdr, nameHdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import {
  buildScoreWebLayout,
  buildSheetWebLayoutHtml,
  type SheetView,
} from "../src/sheet/sheet-html.ts";

const WOUND_COLOR: Record<WoundState, string> = {
  healthy:  "%cg",
  lightly:  "%cy",
  seriously:"%cr",
  mortally: "%cr",
  dead:     "%cx",
};

/** HP bar using chargen-style bar helper signature (char fill). */
function hpBar(current: number, max: number, width = 20): string {
  const filled = Math.round((current / max) * width);
  const empty  = width - filled;
  return `%cg${"#".repeat(filled)}%cn${".".repeat(empty)} ${val(current)}/${val(max)}`;
}

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+sheet[/<switch>] [<player>]  -- Display your character sheet, or another player's.

Switches:
  /stats     Stats only.
  /skills    Skills only.
  /cyber     Chrome and humanity.
  /combat    Combat status and injuries.
  /economy   Eddies and lifestyle.

Examples:
  +sheet               View your own full sheet.
  +sheet Rogue         View Rogue's sheet.
  +sheet/combat        Show your combat status.
  +sheet/cyber         Show your chrome.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    let target: IDBObj = u.me;
    if (arg) {
      const found = await u.util.target(u.me, arg, true);
      if (!found) {
        u.send(`${ERR}No such runner in the grid.`);
        return;
      }
      target = found;
    }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr || !cpr.chargenComplete) {
      const isMe = target.id === u.me.id;
      u.send(isMe
        ? `${ARR}Chrome not installed. Type ${val("+chargen")} to jack in.`
        : `${ERR}${u.util.displayName(target, u.me)} hasn't run chargen yet.`
      );
      return;
    }

    const name = u.util.displayName(target, u.me);
    const role = getRole(cpr.role);
    // Bare name for nav cmds when viewing someone else
    const targetArg = target.id === u.me.id
      ? ""
      : String(target.name || arg).trim();

    const view = (!sw || sw === "full")
      ? "overview"
      : sw as SheetView;
    const known = new Set([
      "overview",
      "stats",
      "skills",
      "cyber",
      "combat",
      "economy",
    ]);
    if (sw && sw !== "full" && !known.has(sw)) {
      u.send(
        `${ERR}Unknown switch ${val("/" + sw)}. ` +
          `Valid: /stats /skills /cyber /combat /economy`,
      );
      return;
    }

    if (trySendWebSheet(u, name, cpr, view, targetArg)) {
      return;
    }

    if (!sw || sw === "full") {
      await sendFullSheet(u, name, cpr, role.displayName);
    } else if (sw === "stats") {
      sendStatsSection(u, cpr);
    } else if (sw === "skills") {
      sendSkillsSection(u, cpr);
    } else if (sw === "cyber") {
      sendCyberSection(u, cpr);
    } else if (sw === "combat") {
      sendCombatSection(u, cpr);
    } else if (sw === "economy") {
      sendEconomySection(u, cpr);
    }
  },
});

function trySendWebSheet(
  u: IUrsamuSDK,
  name: string,
  cpr: ICPRCharacter,
  view: SheetView,
  targetArg: string,
): boolean {
  const ct = (u as { clientType?: string }).clientType;
  // deno-lint-ignore no-explicit-any
  const ui = (u as any).ui;
  if (ct !== "web" || !ui || typeof ui.layout !== "function") {
    return false;
  }
  try {
    ui.layout(buildSheetWebLayoutHtml(name, cpr, {
      view,
      targetArg,
    }));
    return true;
  } catch {
    return false;
  }
}

// deno-lint-ignore require-await
async function sendFullSheet(
  u: IUrsamuSDK,
  name: string,
  cpr: ICPRCharacter,
  roleName: string
): Promise<void> {
  const lines: string[] = [];
  const s = cpr.stats;

  // Two-column layout helpers
  const strip = (t: string) => t.replace(/%c[a-z]|%[rtnb]/gi, "");
  const COL1 = 36;   // left panel visible width (incl. 2-char indent)
  const LLBL = 6;    // left label column width
  const RLBL = 10;   // right label column width
  const GAP  = "   ";  // 3-space gap between columns (no separator line)

  // Left cell: 2-char indent + LLBL-char label + 1 space + value, padded to COL1
  const lc = (label: string, value: string): string => {
    const raw = `  ${lbl(label.padEnd(LLBL))} ${value}`;
    return raw + " ".repeat(Math.max(0, COL1 - strip(raw).length));
  };
  // Right cell: RLBL-char label + 1 space + value
  const rc = (label: string, value: string): string =>
    `${lbl(label.padEnd(RLBL))} ${value}`;

  // Cyberpunk-styled two-column section header: "// LEFT" ... "// RIGHT"
  const sHdr = (l: string, r: string): string => {
    const tag = (t: string) => `%cc//%cn %cw${t}%cn`;
    const raw = `  ${tag(l)}`;
    return raw + " ".repeat(Math.max(0, COL1 - strip(raw).length)) + GAP + tag(r);
  };

  // Zip two panels side by side
  const twoCol = (left: string[], right: string[]): string[] => {
    const max = Math.max(left.length, right.length);
    const empty = " ".repeat(COL1);
    return Array.from({ length: max }, (_, i) =>
      (left[i] ?? empty) + GAP + (right[i] ?? "")
    );
  };

  // --- HEADER ---
  lines.push(bar());
  lines.push(nameHdr(val(name), roleName));
  lines.push(bar());

  // --- STATS (3-column grid) ---
  {
    // Each cell: "  LABEL  value" padded to 26 visible chars
    const SC = 26;
    const sc = (label: string, value: string): string => {
      const raw = `  ${lbl(label.padEnd(4))} ${value}`;
      return raw + " ".repeat(Math.max(0, SC - strip(raw).length));
    };
    const statRows = [
      [sc("INT",  val(s.int)),  sc("WILL", val(s.will)), sc("MOVE", val(s.move))],
      [sc("REF",  val(s.ref)),  sc("LUCK", `${val(s.luck)} ${dim(`pool:${cpr.luckRemaining}`)}`), sc("BODY", val(s.body))],
      [sc("DEX",  val(s.dex)),  sc("TECH", val(s.tech)), sc("COOL", val(s.cool))],
      [sc("EMP",  `${val(s.emp)}/${val(s.empBase)}`)],
    ];
    lines.push(`  ${lbl("STATS")}`);
    for (const cols of statRows) lines.push(cols.join(""));
  }
  lines.push(div());

  // --- HEALTH | CHROME ---
  const wc      = WOUND_COLOR[cpr.woundState];
  const dmgPen  = woundActionPenalty(cpr.woundState);
  const movePen = woundMovePenalty(cpr.woundState);

  const stunChar = ensureStunPool(cpr);
  const stunCur  = stunChar.stun!.current;
  const stunMax  = stunChar.stun!.max;
  const stunOut  = isUnconscious(stunChar);
  const stunDisp = stunOut
    ? `${val(`${stunCur}/${stunMax}`)}  %cr[KO]%cn`
    : `${val(`${stunCur}/${stunMax}`)}`;

  const healthLeft: string[] = [
    lc("HP",    hpBar(cpr.hp.current, cpr.hp.max, 12)),
    lc("STUN",  stunDisp),
    lc("WOUND", `${wc}${cpr.woundState.toUpperCase()}%cn  ${dim(`sw ${cpr.swThreshold}`)}`),
    lc("ARMOR", cpr.armorBody
      ? `${val(cpr.armorBody.name)} ${dim(`SP ${cpr.armorBody.currentSp}/${cpr.armorBody.sp}`)}`
      : dim("none")),
    lc("HEAD",  cpr.armorHead
      ? `${val(cpr.armorHead.name)} ${dim(`SP ${cpr.armorHead.currentSp}/${cpr.armorHead.sp}`)}`
      : dim("none")),
  ];
  if (dmgPen !== 0) healthLeft.push(lc("PEN", `%cr${dmgPen} action / ${movePen} move%cn`));

  const cyberRows = cpr.cyberware.map((cw) =>
    rc(cw.name.replace(/_/g, " "), dim(`HL ${cw.hl}`))
  );
  const chromeRight: string[] = [
    rc("EMP",     hpBar(s.emp, s.empBase, 10)),
    rc("HL LOST", val(cpr.humanityLoss)),
    ...(cpr.cyberware.length === 0 ? [dim("  no chrome")] : cyberRows),
    ...(() => {
      const sev = cyberpsychosisSeverity(
        s.emp,
        s.empBase,
        cpr.humanityLoss,
      );
      if (sev === "none" || sev === "mild") return [] as string[];
      return [`${ERR}${acc(sev.toUpperCase())}`];
    })(),
  ];

  lines.push(sHdr("HEALTH", "CHROME"));
  lines.push(...twoCol(healthLeft, chromeRight));
  lines.push(div());

  // --- ROLE | ECONOMY ---
  const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);

  const roleLeft: string[] = [
    lc("CLASS", `${val(roleName.toUpperCase())}  ${dim("rank")} ${acc(String(cpr.roleRank))}`),
    lc("REP",   val(cpr.reputation)),
  ];
  const econRight: string[] = [
    rc("EDDIES",    `${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}`),
    rc("LIFESTYLE", val(ls?.displayName ?? "none")),
  ];

  lines.push(sHdr("ROLE", "ECONOMY"));
  lines.push(...twoCol(roleLeft, econRight));
  lines.push(bar());
  lines.push(`  ${dim("+sheet/skills  +sheet/cyber  +sheet/combat  for detail views")}`);

  u.send(lines.join("\r\n"));
}

function sendStatsSection(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const s = cpr.stats;
  u.send([
    bar(),
    hdr("STATS"),
    bar(),
    row("INT",         val(s.int)),
    row("REF",         val(s.ref)),
    row("DEX",         val(s.dex)),
    row("TECH",        val(s.tech)),
    row("COOL",        val(s.cool)),
    row("WILL",        val(s.will)),
    row("LUCK",        `${val(s.luck)}  ${dim(`pool: ${cpr.luckRemaining}`)}`),
    row("MOVE",        val(s.move)),
    row("BODY",        val(s.body)),
    row("EMP",         `${val(s.emp)}/${val(s.empBase)}`),
    div(),
    row("DEATH SAVE",  `${val(cpr.deathSave)}  ${dim(`penalty: ${totalDeathSavePenalty(cpr)}`)}`),
    bar(),
  ].join("\r\n"));
}

function sendSkillsSection(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const sorted = Object.entries(cpr.skills)
    .filter(([, v]) => v > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const items = sorted.map(([k, v]) =>
    `${lbl(skillDisplayName(k))} ${val(String(v))}`
  );

  u.send([
    bar(),
    hdr("SKILLS"),
    bar(),
    ...grid(items, 3, "  "),
    bar(),
  ].join("\r\n"));
}

function sendCyberSection(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const lines: string[] = [
    bar(),
    hdr("CHROME"),
    bar(),
    row("EMP",            `${val(cpr.stats.emp)}/${val(cpr.stats.empBase)}`),
    row("HUMANITY LOSS",  val(cpr.humanityLoss)),
    div(),
  ];

  if (cpr.cyberware.length === 0) {
    lines.push(`  ${dim("No chrome installed -- still all meat.")}`);
  } else {
    for (const cw of cpr.cyberware) {
      lines.push(row(cw.name.replace(/_/g, " "), `${dim("HL")} ${val(cw.hl)}`));
    }
  }

  if (cpr.bodysculpt.length > 0) {
    lines.push(div());
    lines.push(`  ${lbl("BODYSCULPTING")}`);
    for (const bs of cpr.bodysculpt) {
      const hlStr  = bs.hl > 0 ? `  ${dim("HL")} ${val(bs.hl)}` : "";
      const exotic = bs.exotic ? `  %cr[EXOTIC]%cn` : "";
      lines.push(`  ${acc(bs.modification)}${hlStr}${exotic}`);
    }
  }

  lines.push(bar());
  u.send(lines.join("\r\n"));
}

function sendCombatSection(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const wc    = WOUND_COLOR[cpr.woundState];
  const dsPen = totalDeathSavePenalty(cpr);
  const lines: string[] = [
    bar(),
    hdr("COMBAT STATUS"),
    bar(),
    row("HP",          hpBar(cpr.hp.current, cpr.hp.max)),
    row("STUN",        (() => {
      const sc = ensureStunPool(cpr);
      const ko = isUnconscious(sc) ? `  %cr[KO]%cn` : "";
      return `${val(`${sc.stun!.current}/${sc.stun!.max}`)}${ko}`;
    })()),
    row("WOUND STATE", `${wc}${cpr.woundState.toUpperCase()}%cn`),
    row("DEATH SAVE",  `${val(cpr.deathSave - dsPen)}  ${dim(`base ${cpr.deathSave} - pen ${dsPen}`)}`),
    row("ARMOR MEAT",  cpr.armorBody
      ? `${val(cpr.armorBody.name)}  SP ${acc(String(cpr.armorBody.currentSp))}/${dim(String(cpr.armorBody.sp))}`
      : dim("none")),
    row("ARMOR HEAD",  cpr.armorHead
      ? `${val(cpr.armorHead.name)}  SP ${acc(String(cpr.armorHead.currentSp))}/${dim(String(cpr.armorHead.sp))}`
      : dim("none")),
  ];

  if (cpr.criticalInjuries.length > 0) {
    lines.push(div());
    lines.push(`  ${lbl("CRITICAL INJURIES")}`);
    for (const inj of cpr.criticalInjuries) {
      const loc     = inj.location.toUpperCase();
      const treated = inj.treated ? dim("[treated]") : `%cr[untreated]%cn`;
      lines.push(`  ${acc(`[${loc}]`)} ${val(inj.name)} ${treated}`);
      lines.push(`    ${dim(inj.effects)}`);
    }
  }

  if (cpr.activeEffects.length > 0) {
    lines.push(div());
    lines.push(`  ${lbl("ACTIVE DRUG EFFECTS")}`);
    for (const eff of cpr.activeEffects) {
      const remaining = Math.max(0, Math.round((eff.expiresAt - Date.now()) / 60000));
      lines.push(row(eff.drug, `${dim(eff.effect)}  ${acc(String(remaining))}${dim("m left")}`));
    }
  }

  lines.push(bar());
  u.send(lines.join("\r\n"));
}

function sendEconomySection(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);
  const lines: string[] = [
    bar(),
    hdr("ECONOMY"),
    bar(),
    row("EDDIES",     `${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}`),
    row("LIFESTYLE",  `${val(ls?.displayName ?? "none")}  ${dim(`${ls?.monthlyCostEb ?? 0} eb/month`)}`),
    row("REPUTATION", val(cpr.reputation)),
  ];

  if (cpr.reputationDeeds.length > 0) {
    lines.push(div());
    lines.push(`  ${lbl("KNOWN FOR")}`);
    for (const deed of cpr.reputationDeeds.slice(0, 5)) {
      lines.push(`    ${ARR}${dim(deed)}`);
    }
  }

  lines.push(bar());
  u.send(lines.join("\r\n"));
}

// -- +score (quick combat strip) ----------------------------------------------

/** One-glance combat vitals — matches web rail / image strip. */
function formatScoreLines(
  name: string,
  cpr: ICPRCharacter,
): string[] {
  const s = cpr.stats;
  const role = getRole(cpr.role);
  const wc = WOUND_COLOR[cpr.woundState] ?? "%cw";
  const stun = ensureStunPool(cpr);
  const stunCur = stun.stun?.current ?? 0;
  const stunMax = stun.stun?.max ?? cpr.hp.max;
  const ko = isUnconscious(stun) ? ` %cr[KO]%cn` : "";
  const dsPen = totalDeathSavePenalty(cpr);
  const death = (cpr.deathSave ?? 0) - dsPen;
  const sw = cpr.swThreshold != null
    ? cpr.swThreshold
    : Math.ceil((cpr.hp?.max ?? 0) / 2);
  const luckCur = cpr.luckRemaining != null
    ? cpr.luckRemaining
    : s.luck;
  const body = cpr.armorBody;
  const head = cpr.armorHead;
  const bodySp = body
    ? `${val(String(body.currentSp ?? body.sp))}/` +
      `${dim(String(body.sp))}`
    : dim("0/0");
  const headSp = head
    ? `${val(String(head.currentSp ?? head.sp))}/` +
      `${dim(String(head.sp))}`
    : dim("0/0");
  const bodyName = body?.name
    ? dim(body.name.replace(/_/g, " "))
    : dim("none");
  const headName = head?.name
    ? dim(head.name.replace(/_/g, " "))
    : dim("none");

  return [
    `${val(name)}  ${dim("::")}  ${acc(role.displayName)}  ` +
      `${dim("r")}${val(String(cpr.roleRank ?? 4))}`,
    `${lbl("HP")} ${hpBar(cpr.hp.current, cpr.hp.max, 12)}  ` +
      `${lbl("STUN")} ${val(`${stunCur}/${stunMax}`)}${ko}`,
    `${lbl("ARMOR")} ${lbl("BODY")} SP ${bodySp}  ` +
      `${dim("(")}${bodyName}${dim(")")}  ` +
      `${lbl("HEAD")} SP ${headSp}  ` +
      `${dim("(")}${headName}${dim(")")}`,
    `${lbl("WOUND")} ${wc}${String(cpr.woundState || "healthy")
      .toUpperCase()}%cn  ` +
      `${lbl("SW")} ${val(String(sw))}  ` +
      `${lbl("DEATH")} ${val(String(death))}  ` +
      `${lbl("EMP")} ${val(String(s.emp))}` +
      `${dim("/" + String(s.empBase ?? s.emp))}`,
    `${lbl("HL")} ${val(String(cpr.humanityLoss ?? 0))}  ` +
      `${lbl("LUCK")} ${val(String(luckCur))}` +
      `${dim("/" + String(s.luck ?? luckCur))}  ` +
      `${lbl("EB")} ${val(
        Number(cpr.eurodollars ?? 0).toLocaleString(),
      )}`,
  ];
}

addCmd({
  name: "+score",
  pattern: /^\+score(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+score [<player>]  -- Quick combat vitals strip.

Shows HP, stun, armor SP, wound, SW, death save, EMP, HL,
luck pool, and eddies — the fight readout.

Examples:
  +score           Your combat strip.
  +score Rogue     Rogue's combat strip.`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    let target: IDBObj = u.me;
    if (arg) {
      const found = await u.util.target(u.me, arg, true);
      if (!found) {
        u.send(`${ERR}No such runner in the grid.`);
        return;
      }
      target = found;
    }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) {
      const isMe = target.id === u.me.id;
      u.send(
        isMe
          ? `${ERR}No chrome loaded. Type ${val("+chargen")} ` +
            `to begin.`
          : `${ERR}${u.util.displayName(target, u.me)} ` +
            `hasn't finished chargen.`,
      );
      return;
    }

    const name = String(u.util.displayName(target, u.me));
    const text = formatScoreLines(name, cpr).join("\r\n");

    // Web /play — same layout bag shape as +sheet
    const ct = (u as { clientType?: string }).clientType;
    // deno-lint-ignore no-explicit-any
    const ui = (u as any).ui;
    if (ct === "web" && ui && typeof ui.layout === "function") {
      try {
        ui.layout(buildScoreWebLayout(name, cpr));
        return;
      } catch (e: unknown) {
        console.error("[cpr] +score web layout:", e);
      }
    }

    u.send(text);
  },
});
