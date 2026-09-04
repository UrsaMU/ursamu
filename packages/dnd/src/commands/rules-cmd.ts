/**
 * +condition, +inspiration — conditions and heroic inspiration.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  addCondition,
  removeCondition,
} from "../stats/conditions.ts";
import {
  setInspiration,
  setExhaustion,
} from "../stats/rules.ts";
import { clearConcentration } from
  "../stats/concentration.ts";
import { CONDITIONS } from "../data/catalog.ts";
import {
  sheetOf,
  saveSheet,
  isStaff,
  resolveTarget,
} from "./rules-helpers.ts";

addCmd({
  name: "+condition",
  pattern: /^\+(?:condition|cond)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+condition [<player>] — List conditions.\n` +
    `+condition/add <cond> [=player]\n` +
    `+condition/remove <cond> [=player]\n` +
    `+condition/clear [=player]\n` +
    `+condition/list — Catalog of slugs.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list") {
      u.send(
        `%ch%ccCOND>>%cn ` +
          CONDITIONS.map((c) => c.name).join(", "),
      );
      return;
    }

    let condRaw = "";
    let whoRaw = "";
    if (arg.includes("=")) {
      const [a, b] = arg.split("=").map((x) => x.trim());
      condRaw = a;
      whoRaw = b;
    } else if (
      sw === "add" || sw === "remove" || sw === "rm" ||
      sw === "exhaustion" || sw === "exh"
    ) {
      condRaw = arg;
    } else {
      whoRaw = arg;
    }

    const target = await resolveTarget(u, whoRaw);
    if (!target) return;
    let s = sheetOf(target);
    if (!s) {
      u.send("No character sheet.");
      return;
    }
    const name = u.util.displayName(target, u.me);

    if (!sw || sw === "view" || sw === "status") {
      const list = (s.conditions ?? []).join(", ") || "none";
      const conc = s.concentration?.spell
        ? ` Conc: ${s.concentration.spell}`
        : "";
      const exh = (s.exhaustion ?? 0) > 0
        ? ` Exhaustion ${s.exhaustion}`
        : "";
      u.send(
        `%ch%ccCOND>>%cn ${name}: ${list}.${conc}${exh}`,
      );
      return;
    }

    if (!(await u.canEdit(u.me, target)) && !isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    if (sw === "add") {
      const r = addCondition(s, condRaw);
      if (!r.entry) {
        u.send("Unknown condition. Try +condition/list.");
        return;
      }
      if (!r.added) {
        u.send(`${name} already has ${r.entry.name}.`);
        return;
      }
      await saveSheet(u, target, r.sheet);
      u.send(
        `%ch%ccCOND>>%cn ${name} gains %ch${r.entry.name}%cn.`,
      );
      return;
    }

    if (sw === "remove" || sw === "rm") {
      const r = removeCondition(s, condRaw);
      if (!r.removed) {
        u.send(`${name} does not have that condition.`);
        return;
      }
      await saveSheet(u, target, r.sheet);
      u.send(`%ch%ccCOND>>%cn Removed from ${name}.`);
      return;
    }

    if (sw === "clear") {
      s = { ...s, conditions: [] };
      s = clearConcentration(s);
      await saveSheet(u, target, s);
      u.send(
        `%ch%ccCOND>>%cn Cleared conditions on ${name}.`,
      );
      return;
    }

    if (sw === "exhaustion" || sw === "exh") {
      const n = parseInt(condRaw, 10);
      if (isNaN(n)) {
        u.send(
          "Usage: +condition/exhaustion <0-6> [=player]",
        );
        return;
      }
      s = setExhaustion(s, n);
      await saveSheet(u, target, s);
      u.send(
        `%ch%ccCOND>>%cn ${name} exhaustion → ${s.exhaustion}.`,
      );
      return;
    }

    u.send(
      "Switches: /add /remove /clear /list /exhaustion",
    );
  },
});

addCmd({
  name: "+inspiration",
  pattern: /^\+(?:inspiration|insp)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+inspiration [<player>] — Show inspiration.\n` +
    `+inspiration/give|take [<player>]\n` +
    `Spend with +roll/insp <check>.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const target = await resolveTarget(u, arg);
    if (!target) return;
    let s = sheetOf(target);
    if (!s) {
      u.send("No character sheet.");
      return;
    }
    const name = u.util.displayName(target, u.me);

    if (!sw || sw === "view") {
      u.send(
        `%ch%cyINSP>>%cn ${name}: ` +
          `${s.inspiration ? "%chYES%cn" : "no"}.`,
      );
      return;
    }

    if (!(await u.canEdit(u.me, target)) && !isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    if (sw === "give" || sw === "grant" || sw === "on") {
      s = setInspiration(s, true);
      await saveSheet(u, target, s);
      u.send(
        `%ch%cyINSP>>%cn ${name} gains inspiration.`,
      );
      return;
    }

    if (sw === "take" || sw === "clear" || sw === "off") {
      s = setInspiration(s, false);
      await saveSheet(u, target, s);
      u.send(
        `%ch%cyINSP>>%cn ${name} loses inspiration.`,
      );
      return;
    }

    u.send(
      "Switches: /give /take — spend via +roll/insp",
    );
  },
});
