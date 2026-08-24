/** +chargen — Sprawl Goons character creation wizard. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  header,
  dim,
  val,
  ylw,
} from "./chrome.ts";
import {
  defaultChar,
  type ISprawlChar,
  type ISprawlStats,
  type StatKey,
  statTotal,
} from "../db/schemas.ts";
import {
  ensureDraft,
  getChar,
  isStaff,
  saveChar,
} from "../engine/sheet-io.ts";
import {
  AFFECTATIONS,
  ARMOR,
  AUGS,
  AUG_ORIGIN,
  BACKGROUNDS,
  BELONGINGS,
  CHARGEN,
  FIREARMS,
  MELEE,
  QUIRKS,
  STREET_TECH_QUIRKS,
  find,
  pickByRoll,
  roll2d6Key,
  rollD66,
} from "../engine/catalog.ts";
import { rollNd6 } from "../engine/dice.ts";
import type { IAugItem } from "../db/schemas.ts";
import { createItem, displayName } from "../engine/items.ts";
import { tryChargenCatalog } from "./chargen-info.ts";
import {
  checklist,
  statAssignLines,
  statUsageLines,
} from "./chargen-status.ts";

function parseStatAssign(
  raw: string,
): { key: StatKey; n: number } | null {
  const m = raw.match(/^([a-z]+)\s*=\s*(\d+)$/i);
  if (!m) return null;
  const map: Record<string, StatKey> = {
    morphology: "morphology",
    mor: "morphology",
    equilibrium: "equilibrium",
    equ: "equilibrium",
    reaction: "reaction",
    rea: "reaction",
    cognition: "cognition",
    cog: "cognition",
    affinity: "affinity",
    aff: "affinity",
  };
  const key = map[m[1].toLowerCase()];
  if (!key) return null;
  const n = Number(m[2]);
  if (!Number.isInteger(n) || n < 0 || n > 4) return null;
  return { key, n };
}

addCmd({
  name: "+chargen",
  pattern: /^\+chargen(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+chargen[/<switch>] [args]  — Character generation.

Spend 4 points on stats:
  MOR melee · EQU nerve · REA guns/drive
  COG hack/sense · AFF talk/con

Switches:
  /list <topic> [filter] [page]
  /info <slug|name>       One entry detail.
  /start                  Open draft sheet.
  /stat <stat>=<0-4>      Place points (total 4).
  /background <slug|roll>
  /belongings [roll|slug] ×3 gear picks.
  /cash                   2d6 × 100 b¥.
  /quirk · /affect        Optional flavour.
  /submit                 Staff review.
  /restart confirm        Wipe sheet → new draft
  /approve · /reject      Staff only
  /unapprove <name>=note  Unlock approved sheet
  /restart <name> confirm Staff: full wipe

Examples:
  +chargen
  +chargen/list backgrounds
  +chargen/list backgrounds 2
  +chargen/info nodejacker
  +chargen/start
  +chargen/stat reaction=2
  +chargen/restart confirm
  +chargen/submit`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw) {
      const c = getChar(u.me) ?? defaultChar();
      u.send(checklist(c).join("\r\n"));
      return;
    }

    // Reference catalog — no draft / not blocked when approved
    if (tryChargenCatalog(u, sw, arg)) return;

    if (sw === "start") {
      const c = await ensureDraft(u);
      u.send(
        [
          ...checklist(c),
          `  ${OK}Draft online. Place ${val(4)}` +
            ` points with ${val("+chargen/stat")}.`,
        ].join("\r\n"),
      );
      return;
    }

    if (
      sw === "restart" || sw === "reset" || sw === "wipe"
    ) {
      await restartSwitch(u, arg);
      return;
    }

    if (
      sw === "approve" || sw === "reject" ||
      sw === "unapprove" || sw === "reopen" ||
      sw === "pending" || sw === "view"
    ) {
      await staffSwitch(u, sw, arg);
      return;
    }

    let c = getChar(u.me);
    if (!c || c.chargenStatus === "none") {
      u.send(`${ARR}Type ${val("+chargen/start")} first.`);
      return;
    }
    if (c.chargenComplete) {
      u.send(
        `${ERR}Sheet locked. Staff: ` +
          `${val("+chargen/reject <you>=note")} or ` +
          `${val("+chargen/restart <you> confirm")}.`,
      );
      return;
    }

    if (sw === "stat") {
      const p = parseStatAssign(arg);
      if (!p) {
        u.send(statUsageLines().join("\r\n"));
        return;
      }
      const nextStats = {
        ...c.stats,
        [p.key]: p.n,
      } as ISprawlStats;
      if (statTotal(nextStats) > CHARGEN.statPoints) {
        u.send(
          `${ERR}Only ${val(CHARGEN.statPoints)} points` +
            ` total across all stats.` +
            ` Now ${val(statTotal(c.stats))}/` +
            `${val(CHARGEN.statPoints)}.`,
        );
        return;
      }
      c = { ...c, stats: nextStats };
      await saveChar(u, c);
      u.send(statAssignLines(c, p.key, p.n).join("\r\n"));
      return;
    }

    if (sw === "background" || sw === "bg") {
      await setBackground(u, c, arg);
      return;
    }

    if (sw === "belongings" || sw === "gear") {
      await addBelonging(u, c, arg);
      return;
    }

    if (sw === "cash") {
      const dice = rollNd6(2);
      const cash = dice * CHARGEN.cashMultiplier;
      c = { ...c, bityuan: cash };
      await saveChar(u, c);
      u.send(
        `${OK}Starting cash ${val(cash)} b¥` +
          ` ${dim("(2d6 x 100)")}`,
      );
      return;
    }

    if (sw === "quirk" || sw === "street-tech" || sw === "stq") {
      // Quirks 2d6; street-tech clinic quirks also 2d6.
      const street = sw === "street-tech" || sw === "stq" ||
        /^street|clinic|chrome/i.test(arg);
      const table = street ? STREET_TECH_QUIRKS : QUIRKS;
      const key = street
        ? (arg.replace(/^street(-tech)?\s*/i, "").trim() ||
          "roll")
        : arg;
      const roll = key === "roll" || !key ? roll2d6Key() : key;
      const q = pickByRoll(table, roll) ??
        table.find((r) =>
          r.slug === roll.toLowerCase() ||
          String(r.name).toLowerCase().includes(
            roll.toLowerCase(),
          )
        );
      if (!q) {
        u.send(
          `${ERR}Unknown quirk. ` +
            `${val("+chargen/list quirks")} or ` +
            `${val("street-tech")}`,
        );
        return;
      }
      const name = String(q.name);
      if (street) {
        const have = c.streetTechQuirks ?? [];
        if (have.includes(q.slug) || have.includes(name)) {
          u.send(`${ARR}Already have that street-tech quirk.`);
          return;
        }
        c = {
          ...c,
          streetTechQuirks: [...have, q.slug],
          quirks: c.quirks.includes(name)
            ? c.quirks
            : [...c.quirks, name],
        };
        await saveChar(u, c);
        u.send(
          `${OK}Street-tech ${val(name)}` +
            (q.glitch ? ` ${ylw("(Glitch)")}` : ""),
        );
        return;
      }
      if (c.quirks.includes(name)) {
        u.send(`${ARR}Already have that quirk.`);
        return;
      }
      c = { ...c, quirks: [...c.quirks, name] };
      await saveChar(u, c);
      u.send(`${OK}Quirk ${val(name)}`);
      return;
    }

    if (sw === "affect" || sw === "affectations") {
      const roll = arg === "roll" || !arg ? rollD66() : arg;
      const a = pickByRoll(AFFECTATIONS, roll) ??
        AFFECTATIONS.find((r) => r.slug === arg.toLowerCase());
      if (!a) {
        u.send(`${ERR}Unknown affectation.`);
        return;
      }
      const name = String(a.name);
      c = {
        ...c,
        affectations: [...c.affectations, name],
      };
      await saveChar(u, c);
      u.send(`${OK}Look ${val(name)}`);
      return;
    }

    if (sw === "submit") {
      if (statTotal(c.stats) !== CHARGEN.statPoints) {
        u.send(
          `${ERR}Spend exactly ${val(CHARGEN.statPoints)}` +
            ` stat points.`,
        );
        return;
      }
      if (!c.background) {
        u.send(`${ERR}Pick a background first.`);
        return;
      }
      const pname = String(
        u.me.name ?? u.me.state?.name ?? c.name ?? "Goon",
      );
      c = {
        ...c,
        name: pname,
        chargenStatus: "submitted",
        resilience: CHARGEN.resilience,
        resilienceMax: CHARGEN.resilience,
        loadoutMax: CHARGEN.loadout,
      };

      // Open/refresh staff CGEN job (jobs → BBS Jobs board mirror).
      let jobNote = "";
      try {
        const { openCgenJob } = await import(
          "../chargen/cgen_job.ts"
        );
        const jobRes = await openCgenJob({
          actorId: u.me.id,
          actorName: pname,
          char: c,
        });
        if ("number" in jobRes) {
          c = { ...c, submittedJob: jobRes.number };
          jobNote =
            ` CGEN job ${val("#" + jobRes.number)} opened.`;
        } else {
          jobNote =
            ` ${dim("(jobs offline: " + jobRes.error + ")")}`;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        jobNote = ` ${dim("(jobs unavailable)")}`;
        console.error("[sprawl] submit job:", msg);
      }

      await saveChar(u, c);

      try {
        const { sendSprawlMail } = await import(
          "../integrations/mail.ts"
        );
        await sendSprawlMail({
          to: u.me.id,
          subject: "Sprawl chargen submitted",
          body: [
            `Your sheet is pending staff review.`,
            c.submittedJob != null
              ? `CGEN job: #${c.submittedJob}`
              : "Staff will review in-game.",
            `You will get mail when approved or sent back.`,
          ].join("\n"),
        });
      } catch { /* optional mail */ }

      u.send(
        `${OK}Submitted.${jobNote}` +
          ` Staff: ${val("+chargen/approve <you>")}` +
          ` or close the CGEN job.`,
      );
      return;
    }

    u.send(`${ERR}Unknown switch. See ${val("+help chargen")}.`);
  },
});

async function setBackground(
  u: IUrsamuSDK,
  c: ISprawlChar,
  arg: string,
): Promise<void> {
  let row = arg
    ? (find("background", arg) ??
      BACKGROUNDS.find((b) =>
        String(b.name).toLowerCase().includes(arg.toLowerCase())
      ))
    : undefined;
  if (!row || arg === "roll") {
    const roll = rollD66();
    row = pickByRoll(BACKGROUNDS, roll);
  }
  if (!row) {
    u.send(
      `${ERR}Unknown background. ` +
        `${val("+chargen/list backgrounds")}`,
    );
    return;
  }
  const edge = row.edge as {
    name: string;
    slug: string;
  };
  const next: ISprawlChar = {
    ...c,
    background: row.slug,
    backgroundName: String(row.name),
    edge: edge?.slug,
    edgeName: edge?.name,
  };
  await saveChar(u, next);
  u.send(
    [
      `${OK}Background ${val(String(row.name))}`,
      `  Edge ${ylw(edge?.name ?? "—")}`,
    ].join("\r\n"),
  );
}

async function addBelonging(
  u: IUrsamuSDK,
  c: ISprawlChar,
  arg: string,
): Promise<void> {
  const picked = c.belongingsPicked ?? 0;
  if (picked >= CHARGEN.belongings && arg !== "force") {
    u.send(
      `${ARR}Already have ${val(CHARGEN.belongings)}` +
        ` belongings.`,
    );
    return;
  }
  let row = arg && arg !== "roll"
    ? (find("belonging", arg) ??
      BELONGINGS.find((b) =>
        String(b.name).toLowerCase().includes(arg.toLowerCase())
      ))
    : undefined;
  if (!row || arg === "roll" || !arg) {
    row = pickByRoll(BELONGINGS, rollD66());
  }
  if (!row) {
    u.send(`${ERR}Could not pick a belonging.`);
    return;
  }
  // Expand placeholder rolls into concrete Things / augs.
  const augs = [...c.augs];
  let msg = "";
  let consoleSlug: string | undefined;
  const kind = String(row.kind ?? "gear");

  if (kind === "weapon" || row.slug === "ranged-weapon") {
    const g = pickByRoll(FIREARMS, roll2d6Key()) ?? FIREARMS[0];
    const obj = await createItem(u, u.me.id, {
      slug: g.slug,
      name: String(g.name),
      kind: "firearm",
      load: 1,
      bonus: 1,
    });
    msg = obj ? displayName(obj) : String(g.name);
  } else if (row.slug === "melee-weapon") {
    const g = pickByRoll(MELEE, roll2d6Key()) ?? MELEE[0];
    const obj = await createItem(u, u.me.id, {
      slug: g.slug,
      name: String(g.name),
      kind: "melee",
      load: 1,
      bonus: 1,
    });
    msg = obj ? displayName(obj) : String(g.name);
  } else if (kind === "armor" || row.slug === "armour") {
    const g = pickByRoll(ARMOR, roll2d6Key()) ?? ARMOR[0];
    const obj = await createItem(u, u.me.id, {
      slug: g.slug,
      name: String(g.name),
      kind: "armor",
      load: Number(g.load ?? 1),
      bonus: Number(g.bonus ?? 1),
      notes: g.notes ? String(g.notes) : undefined,
      statMods: g.statMods,
      modStat: g.modStat,
      mod: g.mod,
      loadoutMult: g.loadoutMult,
      loadoutBonus: g.loadoutBonus,
      bonusWhen: g.bonusWhen ?? "worn",
    });
    msg = obj ? displayName(obj) : String(g.name);
  } else if (kind === "aug" || row.slug === "augmentation") {
    const g = pickByRoll(AUGS, roll2d6Key()) ?? AUGS[0];
    const item: IAugItem = {
      slug: g.slug,
      name: String(g.name),
      modStat: g.modStat ? String(g.modStat) : undefined,
      mod: g.mod != null ? Number(g.mod) : undefined,
      notes: g.blurb ? String(g.blurb) : undefined,
    };
    augs.push(item);
    const ori = AUG_ORIGIN[
      Math.floor(Math.random() * AUG_ORIGIN.length)
    ];
    msg = `${item.name} [${ori?.name ?? "origin unknown"}]`;
  } else if (kind === "console") {
    const obj = await createItem(u, u.me.id, {
      slug: "ono-sendai-basic",
      name: String(row.name),
      kind: "console",
      load: 1,
      bonus: 0,
    });
    consoleSlug = "ono-sendai-basic";
    msg = obj ? displayName(obj) : String(row.name);
  } else {
    const obj = await createItem(u, u.me.id, {
      slug: row.slug,
      name: String(row.name),
      kind,
      load: Number(row.load ?? 1),
      bonus: 0,
      uses: row.uses,
      usesDice: row.usesDice,
      unit: row.unit,
      useEffect: row.useEffect,
    });
    if (obj) {
      const d = (obj.state?.sprawl_item ?? {}) as {
        uses?: number;
        unit?: string;
      };
      msg = displayName(obj);
      if (d.uses != null) {
        msg += ` (${d.uses}` +
          (d.unit ? ` ${d.unit}` : "") + ")";
      }
    } else {
      msg = String(row.name);
    }
  }
  const bp = picked + 1;
  const next: ISprawlChar = {
    ...c,
    loadout: [],
    augs,
    belongingsPicked: bp,
  };
  if (
    consoleSlug ||
    kind === "console" ||
    row.slug === "ono-sendai-console"
  ) {
    next.console = next.console ?? consoleSlug ??
      "ono-sendai-basic";
  }
  await saveChar(u, next);
  u.send(
    `${OK}Stowed ${val(msg)}` +
      ` (${val(bp)}/${val(CHARGEN.belongings)} belongings)`,
  );
}

async function restartSwitch(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const {
    isRestartConfirm,
    parseRestartArg,
    resetChargen,
  } = await import("../chargen/reset.ts");

  const parsed = parseRestartArg(arg);
  const staff = isStaff(u);
  const targetingOther = !!(parsed.who &&
    parsed.who.toLowerCase() !== "me" &&
    parsed.who.toLowerCase() !==
      String(u.me.name ?? "").toLowerCase());

  if (targetingOther && !staff) {
    u.send(`${ERR}Staff only: restart another player.`);
    return;
  }
  if (!parsed.confirmed && !isRestartConfirm(arg)) {
    const who = targetingOther
      ? parsed.who || "<name>"
      : "";
    u.send(
      [
        `${ARR}Full wipe — sheet, styles, cash, pack gear.`,
        `  Self:  ${val("+chargen/restart confirm")}`,
        staff
          ? `  Staff: ${val("+chargen/restart " +
            (who || "<name>") + " confirm")}`
          : "",
        `  ${dim("This cannot be undone.")}`,
      ].filter(Boolean).join("\r\n"),
    );
    return;
  }

  let target = u.me;
  if (targetingOther || (staff && parsed.who)) {
    const t = await u.util.target(
      u.me,
      parsed.who || arg.replace(/\s+confirm$/i, "").trim(),
      true,
    );
    if (!t) {
      u.send(`${ERR}Not found.`);
      return;
    }
    target = t;
  }

  const res = await resetChargen(u, target);
  u.me.state = target.id === u.me.id
    ? { ...u.me.state, sprawl: res.draft, description: "" }
    : u.me.state;
  u.send(
    [
      `${OK}Chargen reset for ${val(res.name)}.`,
      `  Destroyed ${val(res.destroyed)} pack item(s).`,
      `  Status ${val("draft")} — start with stats.`,
      ...checklist(res.draft).slice(0, 24),
    ].join("\r\n"),
  );
}

async function staffSwitch(
  u: IUrsamuSDK,
  sw: string,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only.`);
    return;
  }
  if (sw === "pending") {
    try {
      const { jobs } = await import("@ursamu/jobs");
      const all = await jobs.find({});
      const open = all.filter((j) =>
        String(j.bucket ?? "").toUpperCase() === "CGEN" &&
        (j.status === "new" || j.status === "open")
      );
      const lines = [header("CGEN PENDING")];
      if (!open.length) {
        lines.push(`  ${dim("none")}`);
      }
      for (const j of open.slice(0, 24)) {
        lines.push(
          `  ${val("#" + j.number)} ` +
            `${j.submitterName || j.submittedBy} — ` +
            `${dim(String(j.title ?? ""))}`,
        );
      }
      lines.push(
        `  ${dim("+chargen/approve <name>  or close CGEN job")}`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
    } catch {
      u.send(
        `${ARR}Jobs offline. Use ` +
          `${val("+chargen/view <name>")} on submitted sheets.`,
      );
    }
    return;
  }
  if (sw === "view") {
    const t = await u.util.target(u.me, arg, true);
    if (!t) {
      u.send(`${ERR}Not found.`);
      return;
    }
    const c = getChar(t);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    u.send(
      [
        header("VIEW " + (t.name ?? arg)),
        `  Status ${val(c.chargenStatus)}`,
        `  BG ${val(c.backgroundName || "—")}`,
        c.submittedJob != null
          ? `  Job ${val("#" + c.submittedJob)}`
          : `  Job ${dim("—")}`,
        `  Stats ${JSON.stringify(c.stats)}`,
        footer()
      ].join("\r\n"),
    );
    return;
  }
  if (sw === "approve") {
    const t = await u.util.target(u.me, arg, true);
    if (!t) {
      u.send(`${ERR}Not found.`);
      return;
    }
    // In-process approve (works in showcases / when dbojs
    // has no row). Job/mail path is best-effort.
    const live = getChar(t);
    if (live) {
      if (
        live.chargenComplete ||
        live.chargenStatus === "approved"
      ) {
        u.send(
          `${ARR}${val(t.name ?? arg)} already approved.`,
        );
        return;
      }
      const next: ISprawlChar = {
        ...live,
        name: String(t.name ?? live.name),
        chargenStatus: "approved",
        chargenComplete: true,
        resilience: live.resilienceMax || CHARGEN.resilience,
        resilienceMax: live.resilienceMax || CHARGEN.resilience,
        reviewNote: undefined,
        submittedJob: undefined,
      };
      await saveChar(u, next, t.id);
      t.state = { ...t.state, sprawl: next };
      try {
        const { approvePlayer } = await import(
          "../chargen/approve_core.ts"
        );
        await approvePlayer({
          playerId: t.id,
          staffId: u.me.id,
          staffName: String(u.me.name ?? "Staff"),
        });
      } catch {
        /* dbojs / jobs optional */
      }
      u.send(`${OK}Approved ${val(t.name ?? arg)}.`);
      return;
    }
    const { approvePlayer } = await import(
      "../chargen/approve_core.ts"
    );
    const res = await approvePlayer({
      playerId: t.id,
      staffId: u.me.id,
      staffName: String(u.me.name ?? "Staff"),
    });
    if (!res.ok) {
      u.send(`${ERR}${res.error}`);
      return;
    }
    if (res.already) {
      u.send(`${ARR}${val(res.name)} already approved.`);
      return;
    }
    const jobBit = res.job != null
      ? ` Job ${val("#" + res.job)} closed.`
      : "";
    u.send(`${OK}Approved ${val(res.name)}.${jobBit}`);
    return;
  }
  if (sw === "reject" || sw === "unapprove" || sw === "reopen") {
    const [who, ...noteParts] = arg.split("=");
    const note = noteParts.join("=").trim() || "Revise.";
    const t = await u.util.target(u.me, who.trim(), true);
    if (!t) {
      u.send(`${ERR}Not found.`);
      return;
    }
    // Unlock live sheet first (same path as saveChar / u.db).
    const live = getChar(t);
    if (live) {
      const next: ISprawlChar = {
        ...live,
        chargenStatus: "revision",
        chargenComplete: false,
        reviewNote: note,
        submittedJob: undefined,
      };
      await saveChar(u, next, t.id);
      t.state = { ...t.state, sprawl: next };
    }
    const { rejectPlayer } = await import(
      "../chargen/approve_core.ts"
    );
    const res = await rejectPlayer({
      playerId: t.id,
      staffId: u.me.id,
      staffName: String(u.me.name ?? "Staff"),
      notes: note,
    });
    if (!res.ok) {
      // Live unlock may have already applied
      if (live) {
        u.send(
          `${OK}Unlocked ${val(t.name ?? arg)} for revision` +
            ` ${dim("(DB note: " + res.error + ")")}.`,
        );
        return;
      }
      u.send(`${ERR}${res.error}`);
      return;
    }
    // Prefer rejectPlayer char if live was empty
    if (!live && res.char) {
      await saveChar(u, res.char, t.id);
      t.state = { ...t.state, sprawl: res.char };
    }
    u.send(
      `${OK}Unlocked ${val(res.name)} — status revision.` +
        ` They can ${val("+chargen")} then submit.`,
    );
  }
}
