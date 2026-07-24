// +hob — create and manage hobgoblins (CtL p.252 light).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  buildHobgoblinSheet,
  isHobgoblinSheet,
  readHobPowers,
  type HobConcept,
} from "../hobgoblin/index.ts";
import { getDreadPower, listDreadPowers } from "../npc/dread.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./hedge_helpers.ts";
import { defaultSheet } from "../stats/index.ts";

const CONCEPTS: HobConcept[] = [
  "trickster",
  "merchant",
  "predator",
  "guardian",
  "crafter",
  "custom",
];

export async function hobCommand(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "status" || sw === "list") {
    return await hobStatus(u, rest);
  }
  if (sw === "concepts") {
    u.send(
      "Hob concepts: " + CONCEPTS.join(", ") +
        "\n  +hob/create <player>=<Name>/<concept>[/wyrd]",
    );
    return;
  }
  if (sw === "powers") {
    const lines = [await divider("D R E A D  P O W E R S")];
    for (const p of listDreadPowers().slice(0, 24)) {
      lines.push(`  %cy${p.key}%cn  ${p.label}  [${p.tierMin}]`);
    }
    lines.push("  +info <key> for detail");
    u.send(lines.join("\n"));
    return;
  }
  if (sw === "create") return await hobCreate(u, rest);
  if (sw === "grant") return await hobGrant(u, rest);
  if (sw === "power") return await hobPower(u, rest);

  u.send(`Unknown +hob switch: /${sw}. Try +hob`);
}

async function hobStatus(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  let target = u.me;
  if (who && isStaff(u.me)) {
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  if (!sheet || !isHobgoblinSheet(sheet)) {
    u.send(
      "Not a hobgoblin sheet. Staff: " +
        "+hob/create <player>=Name/merchant/3",
    );
    return;
  }
  const powers = readHobPowers(sheet);
  u.send(
    [
      await divider("H O B G O B L I N"),
      `  ${u.util.displayName(target, u.me)}  ` +
        `Wyrd ${sheet.powerStatValue}  ` +
        `Glamour ${sheet.energyCurrent}`,
      `  Concept: ${sheet.customFields?.concept ?? "—"}`,
      `  Aspiration: ` +
        `${(sheet.customFields?.aspiration ?? "—").slice(0, 50)}`,
      `  Frailties: ${(sheet.frailties ?? []).join("; ") || "—"}`,
      `  Powers: ${powers.join(", ") || "—"}`,
      "  +hob/power <key>  (activate — ST resolves)",
    ].join("\n"),
  );
}

async function hobCreate(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +hob/create <player>=<Name>/<concept>[/wyrd]");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +hob/create <player>=<Name>/<concept>[/wyrd]\n" +
        "  Concepts: " + CONCEPTS.join(", "),
    );
    return;
  }
  const who = rest.slice(0, eq).trim();
  const bits = rest.slice(eq + 1).split("/").map((s) => s.trim());
  const name = bits[0] || "Hob";
  const conceptRaw = (bits[1] || "trickster").toLowerCase();
  const concept = (CONCEPTS.includes(conceptRaw as HobConcept)
    ? conceptRaw
    : "custom") as HobConcept;
  const wyrd = bits[2] ? parseInt(bits[2], 10) : 2;

  const t = await u.util.target(u.me, who, true);
  if (!t) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  const base = getSheet(t) ?? defaultSheet();
  const hob = buildHobgoblinSheet({
    name,
    concept,
    wyrd: isNaN(wyrd) ? 2 : wyrd,
  });
  // preserve advantages size from base if any
  hob.advantages = {
    ...hob.advantages,
    size: base.advantages?.size ?? hob.advantages.size,
  };
  await persistSheet(u, t.id, hob);
  u.send(
    `Hobgoblin %cy${name}%cn (${concept}, Wyrd ` +
      `${hob.powerStatValue}) on ` +
      `${u.util.displayName(t, u.me)}.`,
  );
}

async function hobGrant(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +hob/grant <player>=<dread-power-key>");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +hob/grant <player>=<power-key>");
    return;
  }
  const t = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  if (!t) {
    u.send("Not found.");
    return;
  }
  const key = rest.slice(eq + 1).trim().toLowerCase();
  if (!getDreadPower(key)) {
    u.send(`Unknown dread power '${key}'. +hob/powers`);
    return;
  }
  const sheet = getSheet(t);
  if (!sheet || !isHobgoblinSheet(sheet)) {
    u.send("Target must be a hobgoblin sheet.");
    return;
  }
  const powers = readHobPowers(sheet);
  if (powers.includes(key)) {
    u.send("Already has that power.");
    return;
  }
  const next = {
    ...sheet,
    hobgoblinState: {
      ...(sheet.hobgoblinState ?? {}),
      dreadPowers: [...powers, key],
    },
  };
  await persistSheet(u, t.id, next);
  u.send(`Granted %cy${key}%cn.`);
}

async function hobPower(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isHobgoblinSheet(sheet)) {
    u.send("Hobgoblin sheets only.");
    return;
  }
  const key = rest.trim().toLowerCase();
  if (!key) {
    u.send("Usage: +hob/power <key>");
    return;
  }
  const powers = readHobPowers(sheet);
  if (!powers.includes(key)) {
    u.send(`You do not have '${key}'. Powers: ${powers.join(", ")}`);
    return;
  }
  const p = getDreadPower(key);
  if (!p) {
    u.send("Unknown power in catalog.");
    return;
  }
  // Light cost: 1 Glamour if cost mentions Glamour
  let next = sheet;
  const needG = /glamour/i.test(p.cost) ? 1 : 0;
  if (needG && (sheet.energyCurrent ?? 0) < needG) {
    u.send("Not enough Glamour.");
    return;
  }
  if (needG) {
    next = {
      ...sheet,
      energyCurrent: (sheet.energyCurrent ?? 0) - needG,
    };
    await persistSheet(u, u.me.id, next);
  }
  u.send(
    [
      `Dread Power: %cy${p.label}%cn` +
        (needG ? " (−1 Glamour)" : "") + ".",
      `  Cost: ${p.cost}  Pool: ${p.pool}`,
      `  ${p.description}`,
      "  ST resolves the effect in the scene.",
    ].join("\n"),
  );
}
