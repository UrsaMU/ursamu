// Renders character generation per-stage instructions, current values,
// and progress. All screens target ≤22 content lines (24-line terminal).

import { header, footer, divider } from "@ursamu/ursamu";
import {
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
  COFD_MERITS,
  splitMeritStorageKey,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { formatDottedStatLine } from "../support/format.ts";
import {
  getStageName,
  maxStageFor,
  powerLabel,
  startingMeritDots,
  startingPowerDots,
  type CofdCgState,
} from "./state.ts";
import { customFieldLabel } from "./fields.ts";
import {
  auspiceMoonGift,
  giftStageProgress,
  shadowAffinityGifts,
} from "./gifts.ts";
import { contractStageProgress } from "./contracts.ts";

// ── Formatting helpers ───────────────────────────────────────────────────────

function ljust(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - s.length));
}

/** ljust that ignores %c* color codes when measuring width. */
function vljust(s: string, w: number): string {
  const vis = s.replace(/%c[a-z]/gi, "").length;
  return s + " ".repeat(Math.max(0, w - vis));
}

/** Same layout as the live sheet trait line. */
function attrCell(label: string, val: number, w: number): string {
  return formatDottedStatLine(label, val, undefined, w);
}

/** Title-case a skill key ("animal ken" → "Animal Ken"). */
function skillLabel(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render three lists side-by-side as N rows of fixed-width cells. */
function threeColumn(
  left: string[],
  mid: string[],
  right: string[],
  cellW: number,
  gutter = " ",
): string[] {
  const rows = Math.max(left.length, mid.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const a = left[i] ?? " ".repeat(cellW);
    const b = mid[i] ?? " ".repeat(cellW);
    const c = right[i] ?? " ".repeat(cellW);
    out.push("  " + a + gutter + b + gutter + c);
  }
  return out;
}

/** N-column compact list; pads with visual width (ignores %c* codes). */
function nColumn(
  items: string[],
  cols: number,
  colW: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += cols) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const item = items[i + c];
      if (item === undefined) break;
      // Last cell on the row needs no trailing pad.
      cells.push(
        c === cols - 1 || i + c === items.length - 1
          ? item
          : vljust(item, colW),
      );
    }
    out.push("  " + cells.join(" "));
  }
  return out;
}

/** Two-column compact list (merits, longer names). */
function twoColumn(items: string[], colW: number): string[] {
  return nColumn(items, 2, colW);
}

// ── Stage screen renderer ────────────────────────────────────────────────────

/**
 * Generates per-stage instructions, current values, and progress.
 * Targets ≤22 content lines per screen for 24-line telnet compatibility.
 */
export async function getStageInstructions(
  _playerName: string,
  cgState: CofdCgState,
): Promise<string> {
  const stage = cgState.stage;
  const sheet = cgState.sheet;
  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  const lines: string[] = [];
  lines.push(
    await header(
      `CHARACTER CREATION -- STAGE ${stage}: ` +
        getStageName(stage).toUpperCase(),
    ),
  );

  // Progress bar — compact bracketed form; falls back to "N of M" if too wide.
  const maxStage = maxStageFor(sheet.template);
  const stageLabels: Record<number, string> = {
    1: "Concept",
    2: "Template",
    3: "Detail",
    4: "Attrs",
    5: "Skills",
    6: "Merits",
    7: "Powers",
    8: "Gifts",
  };
  const stagesList = Array.from({ length: maxStage }, (_, i) => i + 1);
  const steps = stagesList
    .map((s) => {
      const name = stageLabels[s] ?? "Stage";
      return s === stage ? `%ch%cy[${name}]%cn` : `[${name}]`;
    })
    .join(" ");
  const barVisible =
    "  Progress: " +
    stagesList.map((s) => `[${stageLabels[s] ?? "Stage"}]`).join(" ");
  if (barVisible.length <= 78) {
    lines.push(`  %chProgress:%cn ${steps}`);
  } else {
    lines.push(
      `  %chProgress:%cn Stage %ch%cy${stage}%cn of ${maxStage}` +
        ` -- %ch%cy${getStageName(stage)}%cn`,
    );
  }
  lines.push(await divider(""));

  switch (stage) {
    // ── Stage 1: Concept & Anchors ──────────────────────────────────────────
    case 1: {
      const isVamp = tKey === "vampire";
      const aLabel = isVamp ? "Mask" : "Virtue";
      const bLabel = isVamp ? "Dirge" : "Vice";
      lines.push(
        "  Welcome! Start by defining your core identity.",
      );
      if (isVamp) {
        lines.push(
          "  Set Concept, then Mask (public face) and " +
            "Dirge (true self).",
        );
      } else {
        lines.push(
          "  Set Concept, Virtue (strength), and Vice (flaw).",
        );
      }
      lines.push("");
      lines.push(`    %ch%ccConcept:%cn ${sheet.concept}`);
      lines.push(
        `    %ch%cc${aLabel}:%cn` +
          `${" ".repeat(Math.max(1, 7 - aLabel.length))}` +
          `${sheet.virtue}`,
      );
      lines.push(
        `    %ch%cc${bLabel}:%cn` +
          `${" ".repeat(Math.max(1, 7 - bLabel.length))}` +
          `${sheet.vice}`,
      );
      lines.push("");
      lines.push("  %chBackstory Note:%cn");
      lines.push(
        "    Use %ch+notes/add Backstory=<text>%cn " +
          "to write background",
      );
      lines.push("    visible to staff during review.");
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/set concept=<text>   -- Your character concept.",
      );
      if (isVamp) {
        lines.push(
          "    +cg/set mask=<archetype> -- Public face (Mask).",
        );
        lines.push(
          "    +cg/set dirge=<archetype>-- True self (Dirge).",
        );
        lines.push(
          "    +cg/list masks          -- Browse Mask/Dirge.",
        );
      } else {
        lines.push(
          "    +cg/set virtue=<text>    -- Primary virtue.",
        );
        lines.push(
          "    +cg/set vice=<text>      -- Primary vice.",
        );
        lines.push(
          "    +cg/list virtues         -- Browse all virtues.",
        );
      }
      lines.push(
        "    +cg/next                 -- Advance to Stage 2.",
      );
      break;
    }

    // ── Stage 2: Template ───────────────────────────────────────────────────
    case 2:
      lines.push(
        "  Choose your Supernatural Template " +
          "(your character's nature).",
      );
      lines.push(
        "  Supported: %chmortal%cn, %chchangeling%cn, " +
          "%chvampire%cn.",
      );
      lines.push("");
      lines.push(
        `    %ch%ccSelected:%cn ` +
          `${sheet.template.toUpperCase()} (${tmpl.name})`,
      );
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/set template=<name>  -- e.g. vampire.",
      );
      lines.push(
        "    +cg/list templates       -- See all templates.",
      );
      lines.push(
        "    +cg/back                 -- Go back to Stage 1.",
      );
      lines.push(
        "    +cg/next                 -- Advance to Stage 3.",
      );
      break;

    // ── Stage 3: Template Details ───────────────────────────────────────────
    case 3: {
      lines.push(
        `  Configure details for the %ch${tmpl.name}%cn template.`,
      );
      // mask/mien/animals: post-chargen optional prose (+sheet/set).
      // bloodline: optional free-form at vampire creation.
      const optionalCg = new Set([
        "mask",
        "mien",
        "animals",
        "bloodline",
      ]);
      const requiredFields = tmpl.customFields.filter(
        (f) => !optionalCg.has(f),
      );
      if (tKey === "vampire") {
        lines.push(
          "  Clan + Covenant + two Touchstones required; " +
            "Bloodline optional.",
        );
        lines.push(
          `  %chMask/Dirge:%cn ${sheet.virtue} / ${sheet.vice}`,
        );
      }
      if (requiredFields.length === 0 && tKey !== "vampire") {
        lines.push("");
        lines.push(
          "    No template-specific details required for Mortals!",
        );
        lines.push("");
      } else {
        lines.push("");
        for (const f of requiredFields) {
          const title = customFieldLabel(f);
          const val = sheet.customFields[f] ||
            sheet.customFields[f.toLowerCase()] ||
            "Not Set";
          const pad = Math.max(14, title.length + 2);
          lines.push(
            `    %ch%cc${ljust(title + ":", pad)}%cn ${val}`,
          );
        }
        if (tKey === "vampire") {
          const bl = sheet.customFields.bloodline || "(optional)";
          lines.push(
            `    %ch%cc${ljust("Bloodline:", 14)}%cn ${bl}`,
          );
        }
        lines.push("");
      }
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      if (requiredFields.length > 0) {
        for (const f of requiredFields) {
          lines.push(
            `    +cg/set ${f}=<value>    -- Set ${f}.`,
          );
        }
      }
      if (tKey === "vampire") {
        lines.push(
          "    +cg/set mask=<arch>     -- Public face.",
        );
        lines.push(
          "    +cg/set dirge=<arch>    -- True self.",
        );
        lines.push(
          "    +cg/set touchstonemask=<who>  -- Mask anchor.",
        );
        lines.push(
          "    +cg/set touchstonedirge=<who> -- Dirge anchor.",
        );
        lines.push(
          "    +cg/set bloodline=<txt> -- Optional.",
        );
        lines.push(
          "    +cg/list clans|masks    -- Browse (partial OK).",
        );
      }
      lines.push(
        "    +cg/back                 -- Go back to Stage 2.",
      );
      lines.push(
        "    +cg/next                 -- Advance to Stage 4.",
      );
      break;
    }

    // ── Stage 4: Attributes ─────────────────────────────────────────────────
    case 4: {
      lines.push(
        "  Allocate Attribute dots. All start at 1.",
      );
      lines.push(
        "  Extra dots (above 1) must total %ch5%cn/%ch4%cn/%ch3%cn" +
          " across the three groups.",
      );
      lines.push("");

      const atts = sheet.attributes;
      const mExt =
        (atts.intelligence || 1) - 1 +
        (atts.wits || 1) - 1 +
        (atts.resolve || 1) - 1;
      const pExt =
        (atts.strength || 1) - 1 +
        (atts.dexterity || 1) - 1 +
        (atts.stamina || 1) - 1;
      const sExt =
        (atts.presence || 1) - 1 +
        (atts.manipulation || 1) - 1 +
        (atts.composure || 1) - 1;
      const W = 24;
      lines.push(
        "  " +
          vljust(`%ch%ccMental%cn (+${mExt})`, W) +
          " " +
          vljust(`%ch%ccPhysical%cn (+${pExt})`, W) +
          " " +
          vljust(`%ch%ccSocial%cn (+${sExt})`, W),
      );
      const col1 = [
        attrCell("Intelligence", atts.intelligence || 1, W),
        attrCell("Wits", atts.wits || 1, W),
        attrCell("Resolve", atts.resolve || 1, W),
      ];
      const col2 = [
        attrCell("Strength", atts.strength || 1, W),
        attrCell("Dexterity", atts.dexterity || 1, W),
        attrCell("Stamina", atts.stamina || 1, W),
      ];
      const col3 = [
        attrCell("Presence", atts.presence || 1, W),
        attrCell("Manipulation", atts.manipulation || 1, W),
        attrCell("Composure", atts.composure || 1, W),
      ];
      for (const r of threeColumn(col1, col2, col3, W)) lines.push(r);
      lines.push("");
      const totalAllocated = mExt + pExt + sExt;
      lines.push(
        `    %chExtra dots:%cn ${totalAllocated}/12` +
          `  M(+${mExt}) P(+${pExt}) S(+${sExt})`,
      );
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/set <attr>=<dots>  -- Set rating (1-5).",
      );
      lines.push(
        "      Partial names ok: int, str, dex, man, com...",
      );
      lines.push("    +cg/back               -- Go back to Stage 3.");
      lines.push("    +cg/next               -- Validate & advance.");
      break;
    }

    // ── Stage 5: Skills ─────────────────────────────────────────────────────
    // Same 3-col "Name: ***.. (N)" presentation as Attributes (Stage 4).
    case 5: {
      lines.push(
        "  Allocate Skill dots across three groups.",
      );
      lines.push(
        "  Totals must match %ch11%cn/%ch9%cn/%ch7%cn in some permutation.",
      );
      lines.push("");

      const sks = sheet.skills;
      const mSum = COFD_MENTAL_SKILLS.reduce(
        (acc, s) => acc + (sks[s] || 0),
        0,
      );
      const pSum = COFD_PHYSICAL_SKILLS.reduce(
        (acc, s) => acc + (sks[s] || 0),
        0,
      );
      const sSum = COFD_SOCIAL_SKILLS.reduce(
        (acc, s) => acc + (sks[s] || 0),
        0,
      );
      const totalSkills = mSum + pSum + sSum;

      // No group is fixed to 11 — the 11/9/7 split can be any permutation.
      const W = 24;
      lines.push(
        "  " +
          vljust(`%ch%ccMental%cn (${mSum})`, W) +
          " " +
          vljust(`%ch%ccPhysical%cn (${pSum})`, W) +
          " " +
          vljust(`%ch%ccSocial%cn (${sSum})`, W),
      );

      const col1 = COFD_MENTAL_SKILLS.map((s) =>
        attrCell(skillLabel(s), sks[s] || 0, W)
      );
      const col2 = COFD_PHYSICAL_SKILLS.map((s) =>
        attrCell(skillLabel(s), sks[s] || 0, W)
      );
      const col3 = COFD_SOCIAL_SKILLS.map((s) =>
        attrCell(skillLabel(s), sks[s] || 0, W)
      );
      for (const r of threeColumn(col1, col2, col3, W)) lines.push(r);
      lines.push("");
      lines.push(
        `    %chTotal:%cn ${totalSkills}/27` +
          `  Mental ${mSum}  Physical ${pSum}  Social ${sSum}`,
      );
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/set <skill>=<dots>  -- Set rating (0-5).",
      );
      lines.push(
        "      Partial names ok: ath, inv, brawl, animal...",
      );
      lines.push("    +cg/back                -- Go back to Stage 4.");
      lines.push("    +cg/next                -- Validate & advance.");
      break;
    }

    // ── Stage 6: Merits ─────────────────────────────────────────────────────
    case 6: {
      const meritBudget = startingMeritDots(sheet.template);
      const allocatedMerits = Object.keys(sheet.merits || {}).reduce(
        (acc, m) => acc + (sheet.merits[m] || 0),
        0,
      );
      lines.push(
        `  Allocate exactly %ch${meritBudget}%cn merit dots.` +
          `  Spent: %ch${allocatedMerits}%cn / ${meritBudget}`,
      );
      lines.push("");

      const activeMerits = Object.keys(sheet.merits || {}).filter(
        (m) => (sheet.merits[m] || 0) > 0,
      );
      if (activeMerits.length === 0) {
        lines.push("    No merits purchased yet.");
      } else {
        // Same 3-col width as Attributes / Skills (24 each).
        const entries = activeMerits.map((mKey) => {
          const { merit, qualifier } = splitMeritStorageKey(mKey);
          const found = COFD_MERITS.find((m) => m.key === merit);
          const base = found
            ? found.name
            : merit.replace(/\b\w/g, (c) => c.toUpperCase());
          const qual = qualifier
            ? ` (${qualifier.replace(/\b\w/g, (c) => c.toUpperCase())})`
            : "";
          return `%ch%cy${base}${qual}%cn (${sheet.merits[mKey]})`;
        });
        for (const r of nColumn(entries, 3, 24)) lines.push(r);
      }
      lines.push("");
      lines.push(
        "  %chInstanced merits%cn (Contacts, Allies...) need a qualifier:",
      );
      lines.push("    +cg/set contacts(police)=2");
      lines.push(
        "  %chMerit notes:%cn  +notes/add <Merit>=<who/what>",
      );
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/set <merit>=<dots>  -- Allocate dots (empty=clear).",
      );
      lines.push(
        "    +cg/list merits         -- Browse all merit categories.",
      );
      lines.push("    +cg/back                -- Go back to Stage 5.");
      if (maxStage === 6) {
        lines.push(
          "    +cg/submit              -- Submit for staff approval.",
        );
      } else {
        lines.push("    +cg/next                -- Validate & advance.");
      }
      break;
    }

    // ── Stage 7: Powers / Contracts / Renown ────────────────────────────────
    case 7: {
      // Changeling: discrete Contract selection.
      if (sheet.template === "changeling") {
        const prog = contractStageProgress(sheet);
        const pkg = prog.pkg;

        // 1-line package status bar.
        const bar =
          `Common %ch${prog.common}%cn/${pkg.commonCount}` +
          ` (fav ${prog.favoredCommon}/${pkg.favoredCommonMin}` +
          ` gob ${prog.goblin}/${pkg.goblinMax})` +
          `  Royal %ch${prog.royal}%cn/${pkg.royalCount}`;
        lines.push("  Choose your starting Contracts.");
        lines.push(`  ${bar}`);
        lines.push("");
        lines.push(
          `  %chFavored Regalia:%cn ` +
            (pkg.favored.length
              ? pkg.favored.join(", ")
              : "(set seeming + favored in Stage 3)"),
        );
        lines.push(
          `  %chCourt:%cn ${pkg.court || "(unset)"}`,
        );
        lines.push("");

        const list = sheet.contracts ?? [];
        if (list.length === 0) {
          lines.push("    No Contracts chosen yet.");
        } else {
          // Same 3-col width as Attributes / Skills (24 each).
          for (const r of nColumn(
            list.map((c) => `%ch%cy${c}%cn`),
            3,
            24,
          )) {
            lines.push(r);
          }
        }
        lines.push("");
        lines.push(await divider(""));
        lines.push("  %chCommands:%cn");
        lines.push(
          "    +cg/contract <name>    -- Add a Contract.",
        );
        lines.push(
          "    +cg/uncontract <name>  -- Remove a Contract.",
        );
        lines.push(
          "    +cg/list contracts     -- Browse all Contracts.",
        );
        lines.push("    +cg/back               -- Go back to Stage 6.");
        lines.push(
          "    +cg/submit             -- Submit for staff approval.",
        );
        break;
      }

      // Werewolf / Vampire / other: dot-allocated powers.
      const pName = powerLabel(sheet.template);
      const startingDots = startingPowerDots(
        sheet.template,
        sheet.customFields?.tribe,
      );
      const allocatedPowers = tmpl.validPowers.reduce(
        (acc, p) => acc + (sheet.powers[p] || 0),
        0,
      );
      lines.push(
        `  Allocate %ch${startingDots}%cn starting ` +
          `${pName.toLowerCase()} dots.`,
      );
      if (sheet.template === "werewolf") {
        lines.push(
          "  One from auspice, one from tribe, one free." +
            "  Max %ch2%cn per Renown.",
        );
      }
      if (sheet.template === "vampire") {
        const clan =
          sheet.customFields?.clan || "(set clan first)";
        lines.push(
          `  Clan: %ch${clan}%cn — at least %ch2%cn dots ` +
            `must be in-clan.`,
        );
        lines.push(
          "  Browse: %ch+cg/list disciplines%cn",
        );
      }
      lines.push("");
      lines.push(
        `  %ch%cc${pName}%cn  (${allocatedPowers} / ${startingDots})`,
      );
      const MW = 36;
      for (const p of tmpl.validPowers) {
        const title = p.replace(/\b\w/g, (c) => c.toUpperCase());
        const val = sheet.powers[p] || 0;
        lines.push("  " + attrCell(title, val, MW));
      }
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      const powerKey = sheet.template === "werewolf"
        ? "renown"
        : sheet.template === "vampire"
        ? "discipline"
        : "power";
      lines.push(
        `    +cg/set <${powerKey}>=<dots>  -- Allocate dots.`,
      );
      lines.push(
        "    +cg/back                -- Go back to Stage 6.",
      );
      if (maxStage === 7) {
        lines.push(
          "    +cg/submit              -- Submit for staff approval.",
        );
      } else {
        lines.push(
          "    +cg/next                -- Validate & advance.",
        );
      }
      break;
    }

    // ── Stage 8: Gifts & Rites ──────────────────────────────────────────────
    case 8: {
      const prog = giftStageProgress(sheet);
      const pkg = prog.pkg;
      const moon = auspiceMoonGift(sheet);
      const affinity = shadowAffinityGifts(sheet);

      lines.push("  Choose starting Gifts and Rites.");
      if (pkg) {
        // 1-line status bar.
        const facetBar =
          `Facets %ch${prog.moon + prog.shadow + prog.wolf}%cn/` +
          `${pkg.totalFacets}` +
          `  (moon ${prog.moon}  shadow ${prog.shadow}  wolf ${prog.wolf})`;
        lines.push(`  ${facetBar}`);
        lines.push(
          `  Moon Gift: %ch${moon?.name ?? "(set auspice first)"}%cn`,
        );
        const affNames =
          affinity.length > 4
            ? "any Shadow Gift"
            : affinity.map((g) => g.name).join(", ");
        lines.push(`  Shadow Gifts: %ch${affNames}%cn`);
        lines.push(
          `  Rites: %ch${prog.riteDots}%cn / ${pkg.riteDots} dots`,
        );
      } else {
        lines.push(
          "  %crSet your auspice (Stage 3) and Renown (Stage 7) first.%cn",
        );
      }
      lines.push("");

      // Gifts / Rites — same 3-col layout as Attributes / Skills.
      const giftList = sheet.gifts ?? [];
      if (giftList.length === 0) {
        lines.push("  %chGifts:%cn  (none chosen yet)");
      } else {
        lines.push(
          `  %chGifts%cn (${giftList.length}):`,
        );
        for (const r of nColumn(
          giftList.map((g) => `%ch%cy${g}%cn`),
          3,
          24,
        )) {
          lines.push(r);
        }
      }

      const riteList = sheet.rites ?? [];
      if (riteList.length === 0) {
        lines.push("  %chRites:%cn  (none chosen yet)");
      } else {
        lines.push(`  %chRites%cn (${riteList.length}):`);
        for (const r of nColumn(
          riteList.map((r) => `%ch%cy${r}%cn`),
          3,
          24,
        )) {
          lines.push(r);
        }
      }
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(
        "    +cg/gift <facet>    -- Add a Gift facet.",
      );
      lines.push(
        "    +cg/ungift <facet>  -- Remove a Gift facet.",
      );
      lines.push("    +cg/rite <rite>     -- Add a Rite.");
      lines.push("    +cg/unrite <rite>   -- Remove a Rite.");
      lines.push(
        "    +cg/list gifts      -- Browse all Gifts.",
      );
      lines.push("    +cg/back            -- Go back to Stage 7.");
      lines.push(
        "    +cg/submit          -- Submit for staff approval.",
      );
      break;
    }
  }

  lines.push(await divider(""));
  lines.push("  %chHelper Commands:%cn");
  lines.push("    +cg/reset               -- Discard all changes and restart.");
  lines.push(await footer());

  return lines.join("\n");
}
