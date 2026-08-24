/**
 * +cyber -- Cyberware Installation, Viewing, and Removal
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, ICyberware } from "../db/schemas.ts";
import {
  getCyberware,
  cyberwareByCategory,
  displayCyberName,
  installDV,
  installCost,
  slugCyberName,
} from "../data/cyberware.ts";
import { DBO } from "@ursamu/ursamu";
import type { IExtractedChrome } from "../db/schemas.ts";

const chromeDB = new DBO<IExtractedChrome>("cpr.extracted_chrome");
import {
  rollVariableHL,
  applyHumanityLoss,
  cyberpsychosisSeverity,
} from "../engine/cyberpsychosis.ts";
import { recalcDerived } from "../engine/character.ts";
import {
  emitCyberwareInstalled,
  emitCyberpsychosisThreshold,
  emitCyberpsychosisReduced,
} from "../engine/emitters.ts";
import {
  canInstallCyberware,
  findInstalledCyber,
  normalizeCyberName,
  pickFoundationId,
  SUBDERMAL_SP_BY_NAME,
  syncSubdermalSp,
} from "../engine/cyberware-install.ts";
import {
  bar, div, hdr, lbl, val, acc, dim, ylw, ARR, ERR, OK, row, wrap, grid,
} from "./chargen.ts";

addCmd({
  name: "+cyber",
  pattern: /^\+cyber(?:\/(list|install|remove|view|activate))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+cyber[/<switch>] [<argument>]  -- Manage cyberware.

Switches:
  /list [<category>]        List available cyberware (optionally by category).
  /view [player]            View installed cyberware (self, or target).
  /install <name>           Install cyberware on yourself (admin/medtech).
  /remove <name> [from <player>]
                            Remove one piece (admin). Full HL refund.
  /remove all [from <player>]
                            Strip every piece + clear HL (admin).
  /activate <name>          Activate a cyberware ability (e.g. sandevistan).

Examples:
  +cyber/list               Show all cyberware categories.
  +cyber/list neuralware    Show neuralware options.
  +cyber/view               See your installed cyberware.
  +cyber/view glitch.exe    Staff: view another runner's chrome.
  +cyber/install neural link
  +cyber/remove subdermal armor from glitch.exe
  +cyber/remove all from glitch.exe
  +cyber/activate sandevistan speedware`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) {
      u.send(
        `${ERR}No character found. Complete chargen first.`,
      );
      return;
    }

    if (!sw || sw === "view") {
      await sendCyberViewMaybeTarget(u, cpr, arg);
      return;
    }
    if (sw === "list") { sendCyberList(u, arg); return; }
    if (sw === "install") {
      await installCyberware(u, cpr, arg);
      return;
    }
    if (sw === "remove") {
      await removeCyberware(u, cpr, arg);
      return;
    }
    if (sw === "activate") {
      await activateCyberware(u, cpr, arg);
      return;
    }
    u.send(
      `${ERR}Unknown switch ${val("/" + sw)}. Valid: ` +
        `${acc("/list")} ${acc("/view")} ${acc("/install")} ` +
        `${acc("/remove")} ${acc("/activate")}`,
    );
  },
});

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function sendCyberViewMaybeTarget(
  u: IUrsamuSDK,
  selfCpr: ICPRCharacter,
  arg: string,
): Promise<void> {
  if (!arg) {
    sendCyberView(u, selfCpr, u.me.name ?? "You");
    return;
  }
  if (!isStaff(u)) {
    u.send(`${ERR}Only staff can view another runner's chrome.`);
    return;
  }
  const target = await u.util.target(u.me, arg, true);
  if (!target) {
    u.send(`${ERR}Not found: ${val(arg)}.`);
    return;
  }
  // deno-lint-ignore no-explicit-any
  const raw = target as any;
  const tcpr = (raw.state?.cpr ?? raw.data?.cpr) as
    | ICPRCharacter
    | undefined;
  if (!tcpr) {
    u.send(`${ERR}${val(target.name ?? arg)} has no CPR sheet.`);
    return;
  }
  sendCyberView(u, tcpr, target.name ?? arg);
}

function sendCyberView(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  who = "You",
): void {
  const lines: string[] = [
    bar(),
    hdr(`CHROME -- ${String(who).toUpperCase()}`),
    bar(),
    row(
      "HUMANITY",
      `${val(cpr.stats.emp)} / ${dim(String(cpr.stats.empBase))}  ` +
        `${lbl("HL:")} ${val(cpr.humanityLoss)}`,
    ),
  ];
  const subSp = cpr.subdermalArmorSp ?? syncSubdermalSp(cpr);
  if (subSp > 0) {
    lines.push(row("SUBDERMAL SP", val(String(subSp))));
  }
  lines.push(div());
  const list = cpr.cyberware ?? [];
  if (list.length === 0) {
    lines.push(`  ${dim("No chrome installed. Pure meat.")}`);
  } else {
    const byCategory: Record<string, ICyberware[]> = {};
    for (const cw of list) {
      (byCategory[cw.category] ??= []).push(cw);
    }
    for (const [cat, items] of Object.entries(byCategory)) {
      lines.push(`  ${acc(cat.toUpperCase())}`);
      for (const cw of items) {
        const cwLabel = displayCyberName(cw.name);
        lines.push(
          `    ${val(cwLabel)}  ${lbl("HL:")} ` +
            `${dim(String(cw.hl))}  ` +
            `${dim("[" + cw.installType + "]")}`,
        );
      }
    }
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

function sendCyberList(u: IUrsamuSDK, category: string): void {
  const CATEGORIES = ["fashionware", "neuralware", "cyberoptics", "cyberaudio", "internal", "external", "cyberlimb"];
  if (!category) {
    u.send([
      bar(),
      hdr("CHROME CATALOG -- CYBERWARE"),
      bar(),
      `  ${ARR}Select a category:`,
      "",
      ...grid(CATEGORIES.map(acc), 4, "    "),
      div(),
      `  ${dim("Type")} ${val("+cyber/list <category>")} ${dim("to browse items.")}`,
      bar(),
    ].join("\r\n"));
    return;
  }
  const items = cyberwareByCategory(category);
  if (items.length === 0) { u.send(`${ERR}No chrome found in category ${val(category)}.`); return; }
  const lines: string[] = [
    bar(),
    hdr(`CHROME -- ${category.toUpperCase()}`),
    bar(),
  ];
  for (const cw of items) {
    const hlStr = cw.hlRoll
      ? `${lbl("HL:")} ${dim(cw.hlRoll)}`
      : `${lbl("HL:")} ${dim(String(cw.hl))}`;
    lines.push(
      `  ${val(displayCyberName(cw.name))}  ${hlStr}  ` +
        `${dim("[" + cw.installType + "]")}  ` +
        `${acc(cw.priceCategory)}`,
    );
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function installCyberware(u: IUrsamuSDK, cpr: ICPRCharacter, cwName: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  const isMedtech = cpr.role === "medtech";
  if (!isAdmin && !isMedtech) { u.send(`${ERR}Only a ripperdoc (Medtech) or admin can install chrome.`); return; }

  if (!cwName) { u.send(`${ARR}Specify chrome: ${val("+cyber/install <name>")}`); return; }

  const cwNameClean = slugCyberName(cwName);
  const def = getCyberware(cwNameClean);
  if (!def) {
    u.send(
      `${ERR}Unknown chrome ${val(cwName)}. ` +
        `Type ${val("+cyber/list")} to browse.`,
    );
    return;
  }

  // Foundations, option slots, allowMultiple, HL budget
  const gate = canInstallCyberware(cpr, cwNameClean);
  if (!gate.ok) {
    u.send(`${ERR}${gate.error}.`);
    return;
  }

  // Check if the player is bringing their own extracted chrome
  const ownedChrome = (await chromeDB.find({
    ownerId: u.me.id,
    cyberwareName: def.name,
  }))[0];

  const fee = installCost(def.installType);
  if (cpr.eurodollars < fee) {
    u.send(`${ERR}Insufficient funds. Installation fee: ${val(fee)} eb.`); return;
  }

  if (def.installType === "clinic" || def.installType === "hospital") {
    const dv = installDV(def.installType);
    const tech = cpr.stats.tech;
    const cybertech = cpr.skills["cybertech"] ?? 0;
    const d10 = Math.floor(Math.random() * 10) + 1;
    const total = tech + cybertech + d10;
    const success = total >= dv;

    u.send([
      div(),
      `  ${lbl("SURGERY ROLL:")} TECH(${val(tech)}) + Cybertech(${val(cybertech)}) + d10(${val(d10)}) = ${val(total)} vs DV ${val(dv)} ${acc(ARR)} ${success ? OK + "SUCCESS" : ERR + "FAILURE"}`,
    ].join("\r\n"));

    // Fee is always spent (no refund on failure)
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -fee });

    if (!success) {
      u.send(`${ERR}Surgery failed. ${val(def.name.replace(/_/g, " "))} not installed. Fee of ${val(fee)} eb is non-refundable.`);
      return;
    }
  } else {
    // Mall install — no roll, just deduct fee
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -fee });
  }

  // Calculate humanity loss
  const hlAmount = def.hlRoll ? rollVariableHL(def.hlRoll) : def.hl;
  const hlRes = applyHumanityLoss(cpr, hlAmount);
  const newEMP = hlRes.newEMP;
  const cyberpsychosisRisk = hlRes.cyberpsychosisTriggered;
  const updatedChar = {
    ...cpr,
    humanityLoss: hlRes.newHL,
    stats: { ...cpr.stats, emp: hlRes.newEMP },
  };

  const newCW: ICyberware = {
    id: crypto.randomUUID(),
    name: def.name,
    category: def.category,
    hl: hlAmount,
    installType: def.installType,
    installedAt: Date.now(),
    installedBy: u.me.id,
    slots: def.optionSlots,
    slotCost: def.slotCost,
  };
  if (def.requiresFoundation) {
    newCW.installedIn = pickFoundationId(cpr, def.requiresFoundation);
  }

  let preInstall: ICPRCharacter = {
    ...updatedChar,
    cyberware: [...(cpr.cyberware ?? []), newCW],
  };

  // Grafted Muscle: +2 BODY (max 10) — recalc HP/deathSave/swThreshold
  let bodyIncrease = 0;
  if (def.name === "grafted_muscle") {
    const oldBody = preInstall.stats.body;
    const newBody = Math.min(10, oldBody + 2);
    bodyIncrease = newBody - oldBody;
    preInstall = {
      ...preInstall,
      stats: { ...preInstall.stats, body: newBody },
    };
  }

  // Subdermal armor: initialize SP pool on install
  preInstall = {
    ...preInstall,
    subdermalArmorSp: syncSubdermalSp(preInstall),
  };

  const recalced = recalcDerived(preInstall);

  const setFields: Record<string, unknown> = {
    "state.cpr.cyberware": recalced.cyberware,
    "state.cpr.humanityLoss": recalced.humanityLoss,
    "state.cpr.stats": recalced.stats,
    "state.cpr.hp": recalced.hp,
    "state.cpr.swThreshold": recalced.swThreshold,
    "state.cpr.deathSave": recalced.deathSave,
    "state.cpr.subdermalArmorSp": recalced.subdermalArmorSp ??
      syncSubdermalSp(recalced),
  };

  await u.db.modify(u.me.id, "$set", setFields);

  if (ownedChrome) await chromeDB.delete({ id: ownedChrome.id });

  await emitCyberwareInstalled(u.me, newCW, hlAmount);

  const installLines: string[] = [
    div(),
    `  ${OK}Chrome installed: ${val(displayCyberName(def.name))}`,
    row("SOURCE", ownedChrome ? acc("brought in") : dim("catalog")),
    row("INSTALL FEE", `${val(fee)} eb`),
    row("HUMANITY LOSS", `${lbl("HL:")} ${val(hlAmount)}`),
    row(
      "EMP",
      `${val(newEMP)} / ${dim(String(recalced.stats.empBase))}`,
    ),
  ];
  if (bodyIncrease > 0) {
    installLines.push(
      row(
        "BODY",
        `${val(recalced.stats.body)} ` +
          `${dim(`(+${bodyIncrease})`)}`,
      ),
    );
  }
  const subSp = recalced.subdermalArmorSp ?? 0;
  if (SUBDERMAL_SP_BY_NAME[def.name] != null) {
    installLines.push(
      row("SUBDERMAL SP", `${val(subSp)} SP pool`),
    );
  }
  installLines.push(div());

  u.send(installLines.join("\r\n"));

  if (cyberpsychosisRisk) {
    u.send(
      `${ERR}Cyberpsychosis risk! EMP is critically low. ` +
        `Humanity slipping.`,
    );
    await emitCyberpsychosisThreshold(
      u.me.id,
      u.me.name ?? "Unknown",
      recalced.humanityLoss,
      recalced.stats.emp,
    );
  }
}

async function activateCyberware(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  cwName: string,
): Promise<void> {
  if (!cwName) {
    u.send(
      `${ARR}Specify chrome to activate: ` +
        `${val("+cyber/activate <name>")}`,
    );
    return;
  }

  const hit = findInstalledCyber(cpr.cyberware, cwName);
  if (!hit) {
    u.send(`${ERR}${val(cwName)} is not installed.`);
    return;
  }

  if (normalizeCyberName(hit.piece.name) === "sandevistan_speedware") {
    const COOLDOWN_MS = 3_600_000; // 1 hour
    const lastUsed = cpr.sandevistanLastUsed ?? 0;
    const elapsed = Date.now() - lastUsed;
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60_000);
      u.send(`${ERR}Sandevistan is on cooldown. ${val(String(remaining))} minute(s) remaining.`);
      return;
    }
    await u.db.modify(u.me.id, "$set", {
      "state.cpr.sandevistanActive": true,
      "state.cpr.sandevistanLastUsed": Date.now(),
    });
    u.send([
      div(),
      `  ${OK}${ylw("SANDEVISTAN ACTIVE")} -- ${lbl("+3 INITIATIVE")} on next roll.`,
      `  ${dim("Cooldown: 1 hour.")}`,
      div(),
    ].join("\r\n"));
    return;
  }

  u.send(
    `${ERR}${val(displayCyberName(hit.piece.name))} ` +
      `has no activatable ability.`,
  );
}

/**
 * Parse chrome remove args. Spaces welcome — no underscores needed.
 *
 *   subdermal armor
 *   subdermal armor=glitch.exe
 *   subdermal armor from glitch.exe
 *   subdermal armor on glitch.exe
 *   glitch.exe/subdermal armor
 */
function parseRemoveArg(raw: string): { name: string; target?: string } {
  const s = raw.trim();
  if (!s) return { name: "" };

  // name=player
  const eq = s.lastIndexOf("=");
  if (eq > 0) {
    return {
      name: s.slice(0, eq).trim(),
      target: s.slice(eq + 1).trim() || undefined,
    };
  }

  // name from|on player
  const fromM = s.match(/^(.+?)\s+(?:from|on)\s+(\S.+)$/i);
  if (fromM) {
    return { name: fromM[1].trim(), target: fromM[2].trim() };
  }

  // player/name (player token has no spaces)
  const slash = s.indexOf("/");
  if (slash > 0) {
    const left = s.slice(0, slash).trim();
    const right = s.slice(slash + 1).trim();
    if (left && right && !/\s/.test(left)) {
      return { name: right, target: left };
    }
  }

  return { name: s };
}

async function removeCyberware(
  u: IUrsamuSDK,
  selfCpr: ICPRCharacter,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Only admins can remove chrome.`);
    return;
  }
  if (!arg) {
    u.send(
      `${ARR}Specify chrome: ` +
        `${val("+cyber/remove subdermal armor")}  or  ` +
        `${val("+cyber/remove subdermal armor from <player>")}`,
    );
    return;
  }

  const { name: cwName, target: targetName } = parseRemoveArg(arg);
  if (!cwName) {
    u.send(`${ARR}Specify chrome name to remove.`);
    return;
  }

  let subjectId = u.me.id;
  let subjectName = u.me.name ?? "You";
  let cpr = selfCpr;

  if (targetName) {
    const target = await u.util.target(u.me, targetName, true);
    if (!target) {
      u.send(`${ERR}Not found: ${val(targetName)}.`);
      return;
    }
    const tcpr = (target.state?.cpr ??
      // deno-lint-ignore no-explicit-any
      (target as any).data?.cpr) as ICPRCharacter | undefined;
    if (!tcpr) {
      u.send(
        `${ERR}${val(target.name ?? targetName)} has no CPR sheet.`,
      );
      return;
    }
    subjectId = target.id;
    subjectName = target.name ?? targetName;
    cpr = tcpr;
  }

  // Strip everything + clear HL / EMP
  if (normalizeCyberName(cwName) === "all") {
    await stripAllCyberware(u, cpr, subjectId, subjectName);
    return;
  }

  const list = [...(cpr.cyberware ?? [])];
  const hit = findInstalledCyber(list, cwName);

  // Orphan SP: plating pool without a piece row
  if (!hit) {
    const slug = normalizeCyberName(cwName);
    const wantsSub = slug === "subdermal_armor" ||
      slug === "skin_weave" ||
      slug.includes("subdermal");
    if (wantsSub && (cpr.subdermalArmorSp ?? 0) > 0) {
      await u.db.modify(subjectId, "$set", {
        "state.cpr.subdermalArmorSp": 0,
      });
      u.send([
        div(),
        `  ${OK}Cleared orphan subdermal SP on ` +
          `${val(subjectName)} ` +
          `${dim("(no chrome row — SP pool only)")}`,
        row("SUBDERMAL SP", dim("0")),
        div(),
      ].join("\r\n"));
      return;
    }
    const have = list.map((c) => displayCyberName(c.name));
    u.send(
      `${ERR}${val(cwName)} is not installed` +
        (targetName ? ` on ${val(subjectName)}` : "") +
        `.` +
        (have.length
          ? `  ${dim("Have: " + have.join(", "))}`
          : `  ${dim("No chrome listed.")}`),
    );
    return;
  }

  const removed = hit.piece;
  const newList = list.filter((_, i) => i !== hit.index);
  // Staff surgery: full HL refund for the piece (not therapy half).
  const recovered = Math.max(0, removed.hl ?? 0);
  let newHL = Math.max(0, (cpr.humanityLoss ?? 0) - recovered);
  // No chrome left → clear residual HL so EMP can recover fully.
  if (newList.length === 0) newHL = 0;

  let bodyDecrease = 0;
  let baseChar: ICPRCharacter = {
    ...cpr,
    cyberware: newList,
    humanityLoss: newHL,
  };
  if (normalizeCyberName(removed.name) === "grafted_muscle") {
    const currentBody = cpr.stats.body;
    const newBody = Math.max(2, currentBody - 2);
    bodyDecrease = currentBody - newBody;
    baseChar = {
      ...baseChar,
      stats: { ...baseChar.stats, body: newBody },
    };
  }

  baseChar = {
    ...baseChar,
    subdermalArmorSp: syncSubdermalSp(baseChar),
  };
  const empBefore = cpr.stats.emp ?? 0;
  const recalced = recalcDerived(baseChar);
  const empAfter = recalced.stats.emp;

  await u.db.modify(subjectId, "$set", {
    "state.cpr.cyberware": newList,
    "state.cpr.humanityLoss": newHL,
    "state.cpr.stats": recalced.stats,
    "state.cpr.hp": recalced.hp,
    "state.cpr.swThreshold": recalced.swThreshold,
    "state.cpr.deathSave": recalced.deathSave,
    "state.cpr.subdermalArmorSp": recalced.subdermalArmorSp ?? 0,
  });

  if (empBefore <= 0 && empAfter > 0) {
    await emitCyberpsychosisReduced(
      subjectId,
      subjectName,
      recovered,
      empAfter - empBefore,
      empAfter,
    );
  }

  const removeLines: string[] = [
    div(),
    `  ${OK}Chrome removed from ${val(subjectName)}: ` +
      `${val(displayCyberName(removed.name))}`,
    row("HL REFUNDED", val(recovered)),
    row("HL NOW", val(newHL)),
    row(
      "EMP",
      `${val(empAfter)} / ${dim(String(recalced.stats.empBase))}` +
        (empBefore !== empAfter
          ? `  ${dim(`(was ${empBefore})`)}`
          : ""),
    ),
  ];
  if (bodyDecrease > 0) {
    removeLines.push(
      row(
        "BODY",
        `${val(recalced.stats.body)} ` +
          `${dim(`(-${bodyDecrease})`)}`,
      ),
    );
  }
  if (SUBDERMAL_SP_BY_NAME[normalizeCyberName(removed.name)] != null) {
    removeLines.push(
      row(
        "SUBDERMAL SP",
        val(String(recalced.subdermalArmorSp ?? 0)),
      ),
    );
  }
  if (empAfter <= 0) {
    const sev = cyberpsychosisSeverity(
      empAfter,
      recalced.stats.empBase,
      newHL,
    );
    removeLines.push(
      row(
        "PSYCHOSIS",
        `${ERR}${sev.toUpperCase()}  ` +
          `${dim("still EMP 0 — strip more chrome or " +
            "+cpr/hl <name>=0")}`,
      ),
    );
  } else if (empBefore <= 0 && empAfter > 0) {
    removeLines.push(
      row("PSYCHOSIS", `${OK}CLEARED  ${dim("EMP recovered")}`),
    );
  }
  removeLines.push(div());
  u.send(removeLines.join("\r\n"));
}

/** Strip every piece + zero HL (staff emergency). */
async function stripAllCyberware(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  subjectId: string,
  subjectName: string,
): Promise<void> {
  const list = [...(cpr.cyberware ?? [])];
  const oldHL = cpr.humanityLoss ?? 0;
  const empBefore = cpr.stats.emp ?? 0;

  let body = cpr.stats.body;
  if (list.some((c) => normalizeCyberName(c.name) === "grafted_muscle")) {
    body = Math.max(2, body - 2);
  }

  const baseChar: ICPRCharacter = {
    ...cpr,
    cyberware: [],
    humanityLoss: 0,
    subdermalArmorSp: 0,
    stats: { ...cpr.stats, body },
  };
  const recalced = recalcDerived(baseChar);
  const empBase = recalced.stats.empBase ?? 0;
  const empAfter = recalced.stats.emp;

  await u.db.modify(subjectId, "$set", {
    "state.cpr.cyberware": [],
    "state.cpr.humanityLoss": 0,
    "state.cpr.subdermalArmorSp": 0,
    "state.cpr.stats": recalced.stats,
    "state.cpr.hp": recalced.hp,
    "state.cpr.swThreshold": recalced.swThreshold,
    "state.cpr.deathSave": recalced.deathSave,
  });

  if (empBefore <= 0 && empAfter > 0) {
    await emitCyberpsychosisReduced(
      subjectId,
      subjectName,
      oldHL,
      empAfter - empBefore,
      empAfter,
    );
  }

  u.send([
    div(),
    `  ${OK}Stripped all chrome from ${val(subjectName)}`,
    row("PIECES REMOVED", val(String(list.length))),
    row("HL", `${val(oldHL)} → ${val(0)}`),
    row(
      "EMP",
      `${val(empAfter)} / ${dim(String(empBase))}` +
        (empBefore !== empAfter
          ? `  ${dim(`(was ${empBefore})`)}`
          : ""),
    ),
    empBefore <= 0 && empAfter > 0
      ? row("PSYCHOSIS", `${OK}CLEARED`)
      : "",
    div(),
  ].filter(Boolean).join("\r\n"));
}
