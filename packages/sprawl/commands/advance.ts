/** +advance +ap +edge — advancement and background edges. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
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
  type StatKey,
  STAT_KEYS,
} from "../db/schemas.ts";
import {
  formatDice,
  gatherBonuses,
  resolveAction,
} from "../engine/action.ts";
import { woundGlitch } from "../engine/damage.ts";
import {
  getChar,
  getInventory,
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import { BACKGROUNDS, find } from "../engine/catalog.ts";
import {
  ADVANCE_TRACKS,
  apCost,
  apPerLevel,
  applyAdvance,
  edgeMax,
  grantAp,
  grantSessionAp,
  missionCloseAp,
  sessionSurvivalAp,
} from "../engine/advance-rules.ts";
import {
  grantApAmount,
  parseWhoRest,
} from "../engine/staff-grant.ts";

addCmd({
  name: "+advance",
  pattern: /^\+advance(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+advance[/<track>]  — Spend AP for a track pick.

Pure AP: ${100} unspent AP = one pick.
Level = lifetime AP / ${100} (never drops when you spend).

Tracks: stats · resilience · loadout · edge (max ${3})

Staff:
  /ready <player>    +${25} AP (job/mission close)
  /session [player]  +${10} AP survival

Examples:
  +advance
  +advance/reaction
  +advance/resilience
  +ap`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    if (sw === "ready") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const t = arg
        ? await u.util.target(u.me, arg, true)
        : u.me;
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      const live = getChar(t);
      if (!live) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const next = grantAp(live, missionCloseAp());
      await saveChar(u, next, t.id);
      u.send(
        `${OK}${val(String(t.name))} +${val(missionCloseAp())}` +
          ` AP → pool ${val(next.ap)}` +
          ` · life ${val(next.apTotal ?? 0)}` +
          ` · Lv${val(next.level)}`,
      );
      return;
    }

    if (sw === "session") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const t = arg
        ? await u.util.target(u.me, arg, true)
        : u.me;
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      const live = getChar(t);
      if (!live) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const next = grantSessionAp(live);
      await saveChar(u, next, t.id);
      u.send(
        `${OK}+${val(sessionSurvivalAp())} AP` +
          ` → pool ${val(next.ap)}` +
          ` · Lv${val(next.level)}` +
          ` (${String(t.name)})`,
      );
      return;
    }

    if (!sw) {
      const total = c.apTotal ?? 0;
      const per = apPerLevel();
      const into = total % per;
      u.send(
        [
          header("ADVANCE"),
          `  Level ${val(c.level)}` +
          `  (life ${val(total)} AP · ${val(into)}/${val(per)})`,
          `  Unspent AP ${val(c.ap)}` +
          `  (need ${val(apCost())} to pick)`,
          `  Edge rating ${val(c.edgeRating ?? 1)}` +
          `/${val(edgeMax())}`,
          `  Tracks: ${dim(ADVANCE_TRACKS.join(" "))}`,
          `  ${dim("+advance/<track> spends " + apCost() + " AP")}`,
          footer("SPRAWL"),
        ].join("\r\n"),
      );
      return;
    }

    const r = applyAdvance(c, sw, "ap");
    if (!r.ok) {
      u.send(`${ERR}${r.reason}`);
      return;
    }
    await saveChar(u, r.next);
    u.send(
      `${OK}Lv${val(r.next.level)}` +
        ` · AP ${val(r.next.ap)} left: ${ylw(r.note)}`,
    );
  },
});

addCmd({
  name: "+ap",
  pattern: /^\+ap(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+ap[/<switch>] [args]  — Advancement Points.

Unspent AP buys +advance picks (${100} each).
Lifetime AP sets Level (every ${100} earned).
Gigs, kills, staff grants add AP.

Switches:
  /add <n>           Staff: grant self
  /add <player>=<n>  Staff: grant other
  /spend             Hint: +advance/<track>

Examples:
  +ap
  +ap/add 10
  +ap/add Alice=25
  +staff/ap Bob=10
  +advance/reaction`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    if (!sw) {
      const total = c.apTotal ?? 0;
      u.send(
        `  AP pool ${val(c.ap)}` +
          ` · life ${val(total)}` +
          ` · Lv${val(c.level)}` +
          ` · pick ${val(apCost())}`,
      );
      return;
    }
    if (sw === "add") {
      if (!isStaff(u)) {
        u.send(
          `${ERR}Staff only. ` +
            `${dim("Earn AP via gigs / staff.")}`,
        );
        return;
      }
      let target = u.me;
      let amountStr = arg;
      const parsed = parseWhoRest(arg);
      if (parsed && !/^\d+$/.test(arg.trim())) {
        const t = await u.util.target(u.me, parsed.who, true);
        if (!t) {
          u.send(`${ERR}Not found.`);
          return;
        }
        target = t;
        amountStr = parsed.rest;
      }
      const n = Number(amountStr);
      const live = getChar(target);
      if (!live) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const r = grantApAmount(live, n);
      if (!r.ok) {
        u.send(`${ERR}${r.reason}`);
        return;
      }
      await saveChar(u, r.char, target.id);
      u.send(
        `${OK}${val(String(target.name))} ${r.note}`,
      );
      return;
    }
    if (sw === "spend") {
      u.send(
        `${ARR}Pick a track: ` +
          `${val("+advance/reaction")} etc.` +
          ` (spends ${apCost()} AP).`,
      );
      return;
    }
    u.send(`${ERR}Unknown switch.`);
  },
});

addCmd({
  name: "+edge",
  pattern: /^\+edge(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+edge[/use|/reset]  — Background Edge roll (+1 stat vs DS).

Edge DS: 10 calm / 12 moderate / 14 major stress.
  Once per scene or encounter per edge rules.

Examples:
  +edge
  +edge/use 12
  +edge/reset`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    const bg = c.background
      ? find("background", c.background)
      : undefined;
    const edge = bg?.edge as {
      name: string;
      stat: string;
      frequency: string;
      blurb: string;
      bonus: number;
    } | undefined;

    if (!sw) {
      u.send(
        [
          header("EDGE"),
          `  ${val(c.edgeName || "none")}`,
          edge
            ? `  ${dim(edge.blurb)}`
            : `  ${dim("no edge data")}`,
          `  Scene used: ${val(c.edgeUsedScene ? "yes" : "no")}` +
          `  Encounter: ${val(c.edgeUsedEncounter ? "yes" : "no")}`,
          footer()
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "reset") {
      await saveChar(u, {
        ...c,
        edgeUsedScene: false,
        edgeUsedEncounter: false,
      });
      u.send(`${OK}Edge uses cleared (new scene/encounter).`);
      return;
    }

    if (sw === "use") {
      if (!edge || !c.background) {
        u.send(`${ERR}No edge on this sheet.`);
        return;
      }
      const freq = edge.frequency;
      if (freq === "scene" && c.edgeUsedScene) {
        u.send(`${ERR}Edge already used this scene.`);
        return;
      }
      if (freq === "encounter" && c.edgeUsedEncounter) {
        u.send(`${ERR}Edge already used this encounter.`);
        return;
      }
      if (freq === "session" && c.edgeUsedSession) {
        u.send(`${ERR}Edge already used this session.`);
        return;
      }

      const ds = Number(arg) || 12;
      const stat = edge.stat as StatKey;
      if (!(STAT_KEYS as readonly string[]).includes(stat)) {
        u.send(`${ERR}Bad edge stat.`);
        return;
      }
      const { items, load } = await getInventory(u, u.me);
      const gath = gatherBonuses(
        c,
        stat,
        edge.bonus ?? 1,
        ["edge +1"],
        load,
        items,
      );
      const result = resolveAction({
        stat,
        statValue: c.stats[stat],
        bonuses: gath.total,
        ds,
        glitch: woundGlitch(c),
        dangerous: false,
      });

      const flags: Record<string, boolean> = {};
      if (freq === "scene") flags.edgeUsedScene = true;
      if (freq === "encounter") flags.edgeUsedEncounter = true;
      if (freq === "session") flags.edgeUsedSession = true;
      await saveChar(u, { ...c, ...flags });

      const outcome = result.success
        ? good("EDGE FIRES")
        : ylw("NO EDGE");
      u.send(
        [
          panelOpen("EDGE", edge.name),
          scan(),
          `  ${stat} + edge vs DS${val(ds)}`,
          `  Dice ${dim(formatDice(result.dice))}`,
          `  Total ${val(result.total)} → ${outcome}`,
          result.success
            ? `  ${dim(edge.blurb)}`
            : `  ${dim("benefit does not trigger")}`,
          panelClose("ONCE"),
        ].join("\r\n"),
      );
      return;
    }

    u.send(`${ERR}Use /use or /reset.`);
  },
});

// keep BACKGROUNDS available for future list switch
void BACKGROUNDS;
