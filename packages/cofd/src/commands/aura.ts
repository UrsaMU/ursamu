// +aura — project Predatory Aura (VtR 2e).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  AURA_FLAVORS,
  findAuraFlavor,
  rollAuraContest,
  applyAuraCondition,
  projectorPools,
  resistPools,
} from "../beast/index.ts";
import { isVampireSheet } from "../vitae/index.ts";
import {
  migrateSheet,
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";

function getSheet(obj: {
  state?: Record<string, unknown>;
}): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

async function persist(
  u: IUrsamuSDK,
  id: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(id, "$set", {
    "data.cofd": refreshAdvantages(sheet),
  });
}

export async function auraExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const sheet = getSheet(u.me);

  if (!sheet || !isVampireSheet(sheet)) {
    u.send("Only vampires project Predatory Aura.");
    return;
  }

  if (sw === "list" || (!sw && !rest)) {
    const lines = [
      "%chPredatory Aura flavors:%cn",
      ...AURA_FLAVORS.map(
        (f) =>
          `  %cy${f.key}%cn (${f.label}) → ` +
          `${f.condition}`,
      ),
      "Usage: +aura <flavor> <target>",
      "       +aura/project <flavor>=<target>",
    ];
    u.send(lines.join("\n"));
    return;
  }

  // /project flavor=target  or  bare: flavor target
  let flavorRaw = "";
  let targetRaw = "";
  const body = sw === "project" ? rest : `${sw} ${rest}`.trim();
  const eq = body.indexOf("=");
  if (eq >= 0) {
    flavorRaw = body.slice(0, eq).trim();
    targetRaw = body.slice(eq + 1).trim();
  } else {
    const sp = body.indexOf(" ");
    if (sp < 0) {
      u.send("Usage: +aura <flavor> <target>");
      return;
    }
    flavorRaw = body.slice(0, sp).trim();
    targetRaw = body.slice(sp + 1).trim();
  }

  const flavor = findAuraFlavor(flavorRaw);
  if (!flavor) {
    u.send(
      `Unknown aura flavor '${flavorRaw}'. ` +
        `Try: ${AURA_FLAVORS.map((f) => f.key).join(", ")}.`,
    );
    return;
  }
  if (!targetRaw) {
    u.send("Name a target for your aura.");
    return;
  }

  const target = await u.util.target(u.me, targetRaw, true);
  if (!target) {
    u.send(`No one matches '${targetRaw}'.`);
    return;
  }

  const tSheet = getSheet(target);
  const contest = rollAuraContest(
    projectorPools(sheet),
    resistPools(tSheet),
    flavor,
  );

  const tName = u.util.displayName(target, u.me);
  const lines = [
    `%chPredatory Aura — ${flavor.label}%cn vs ${tName}`,
    `  Project: Presence+Intimidation+BP = ` +
      `${contest.projectPool}d → ` +
      `${contest.projectRoll.successes}`,
    `  Resist:  Composure+Tol = ` +
      `${contest.resistPool}d → ` +
      `${contest.resistRoll.successes}`,
  ];

  if (contest.projectorWins) {
    lines.push(
      `  %cgSuccess:%cn ${tName} gains ` +
        `%cy${flavor.condition}%cn.`,
    );
    if (tSheet) {
      const updated = applyAuraCondition(
        tSheet,
        flavor,
        `Aura: ${u.util.displayName(u.me, target)}`,
      );
      await persist(u, target.id, updated);
    }
  } else {
    lines.push(
      `  %cyResisted:%cn ${tName} holds against the Beast.`,
    );
  }

  u.send(lines.join("\n"));
  if (target.id !== u.me.id) {
    u.send(
      `${u.util.displayName(u.me, target)} projects ` +
        `a Predatory Aura (${flavor.label}) at you.`,
      target.id,
    );
  }
}
