// +hedge/forage, /fruit, /eat — goblin fruit as real objects.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import { executeRoll } from "../roller/index.ts";
import {
  applyFruitEffects,
  consumeFruitObject,
  countFruitObjects,
  createFruitObject,
  findFruit,
  foragePool,
  fruitCarryCap,
  fruitSlug,
  isInHedge,
  itemData,
  listFruitObjects,
  listFruits,
  migrateSheetFruitToObjects,
  queueShadowFruit,
  readHedgeState,
  readyShadowFruit,
  resolveForage,
  writeShadowPending,
} from "../hedge/index.ts";
import {
  getSheet,
  persistRoomHedge,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";
import type { CofdSheet } from "../stats/index.ts";

async function ensureMigrated(
  u: IUrsamuSDK,
  sheet: CofdSheet,
): Promise<CofdSheet> {
  const legacy = sheet.hedgeState?.fruit;
  if (!Array.isArray(legacy) || legacy.length === 0) return sheet;
  const next = await migrateSheetFruitToObjects(u, u.me.id, sheet);
  await persistSheet(u, u.me.id, next);
  return next;
}

export async function hedgeForage(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  let sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  sheet = await ensureMigrated(u, sheet);
  const hr = roomHedge(u.here ?? { state: {} });
  const inHedge = isInHedge(hr) ||
    readHedgeState(sheet).inHedge === true;
  const pool = foragePool(sheet);
  const roll = executeRoll(pool);
  const r = resolveForage({
    sheet,
    room: hr,
    inHedge,
    successes: roll.successes,
    exceptional: roll.exceptional,
    dramaticFailure: roll.dramaticFailure,
  });
  if (!r.ok) {
    u.send(r.reason ?? "Cannot forage.");
    return;
  }
  const lines = [
    `FORAGE>> Wits+Survival ${pool}d → ${roll.successes}s` +
      (roll.exceptional ? " (exceptional)" : "") +
      (roll.dramaticFailure ? " (dramatic failure)" : ""),
    ...r.lines,
  ];
  if (r.fruit) {
    const obj = await createFruitObject(u, u.me.id, r.fruit.slug);
    lines.push(
      obj
        ? "  (item in inventory — drop/give work)"
        : "  (could not create fruit object)",
    );
  }
  u.send(lines.join("\n"));
}

export async function hedgeFruitList(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const filter = rest.toLowerCase().trim();
  if (
    filter === "catalog" || filter === "all" ||
    filter === "common" || filter === "exceptional" ||
    filter === "oddment"
  ) {
    return await fruitCatalog(u, filter);
  }

  let sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  sheet = await ensureMigrated(u, sheet);
  const objs = await listFruitObjects(u, u.me.id);
  const cap = fruitCarryCap(sheet.powerStatValue ?? 0);
  const hr = roomHedge(u.here ?? { state: {} });
  const inHedge = isInHedge(hr) ||
    readHedgeState(sheet).inHedge === true;

  let total = 0;
  const counts = new Map<string, number>();
  for (const o of objs) {
    const slug = fruitSlug(o) ?? "?";
    const n = itemData(o)?.count ?? 1;
    total += n;
    counts.set(slug, (counts.get(slug) ?? 0) + n);
  }

  const lines: string[] = [
    await divider("F R U I T  S A T C H E L"),
  ];
  lines.push(
    `  Carried: ${total}` +
      (inHedge ? " (unlimited in Hedge)" : ` / ${cap}`),
  );
  if (total === 0) {
    lines.push("  (empty)  +hedge/forage in the Hedge");
  } else {
    for (const [slug, n] of counts) {
      const name = findFruit(slug)?.name ?? slug;
      lines.push(`  ${n}× %cy${name}%cn (${slug})`);
    }
  }
  lines.push("  Real items: drop/give.  +hedge/eat <slug>");
  lines.push("  +hedge/fruit catalog");
  u.send(lines.join("\n"));
}

async function fruitCatalog(
  u: IUrsamuSDK,
  filter: string,
): Promise<void> {
  const list = listFruits(
    filter === "catalog" || filter === "all"
      ? "all"
      : filter as "common" | "exceptional" | "oddment",
  );
  const lines: string[] = [
    await divider("G O B L I N  F R U I T"),
  ];
  for (const f of list) {
    lines.push(`  %cy${f.slug}%cn  ${f.name}  [${f.rarity}]`);
    lines.push(`    ${f.effect.slice(0, 70)}`);
  }
  lines.push("  +hedge/fruit  — your satchel");
  u.send(lines.join("\n"));
}

export async function hedgeEat(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  let sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  sheet = await ensureMigrated(u, sheet);
  const slug = u.util.stripSubs(rest).trim();
  if (!slug) {
    u.send("Usage: +hedge/eat <fruit-slug>");
    return;
  }
  const meta = findFruit(slug);
  const key = meta?.slug ?? slug;
  if ((await countFruitObjects(u, u.me.id, key)) < 1) {
    u.send(`You are not carrying '${slug}'.`);
    return;
  }
  if (meta && !meta.edible) {
    u.send(`${meta.name} is not eaten that way.`);
    return;
  }
  // Detect shadow copy before consume (note on stack item)
  const stacks = await listFruitObjects(u, u.me.id);
  let isShadow = false;
  for (const o of stacks) {
    if (fruitSlug(o) !== key) continue;
    const d = itemData(o);
    if (d?.note?.includes("shadow-garden")) {
      isShadow = true;
      break;
    }
  }
  const consumed = await consumeFruitObject(u, u.me.id, key);
  if (!consumed.ok || !consumed.fruit) {
    u.send(`You are not carrying '${slug}'.`);
    return;
  }
  if (isShadow) {
    u.send(
      [
        `You eat a shadow ${consumed.fruit.name}.`,
        "  No Glamour or healing — hunger returns in an hour (ST).",
      ].join("\n"),
    );
    return;
  }

  const r = applyFruitEffects(sheet, consumed.fruit);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot eat that.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  const lines = [...r.lines];

  // Shadow Garden: queue reappear in this Hollow
  const hr = roomHedge(u.here ?? {});
  if (hr?.realm === "hollow" && u.here?.id) {
    const queued = queueShadowFruit(hr, consumed.fruit.slug);
    if (queued) {
      await persistRoomHedge(u, u.here.id, queued);
      lines.push(
        "  Shadow Garden: a copy will form in ~1 hour " +
          "(+hedge/garden).",
      );
    }
  }
  u.send(lines.join("\n"));
}

/** +hedge/garden — pick ready Shadow Garden copies. */
export async function hedgeGarden(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const hr = roomHedge(u.here ?? {});
  if (!hr || hr.realm !== "hollow" || !u.here?.id) {
    u.send("Shadow Garden only works inside a Hollow.");
    return;
  }
  const { ready, remaining } = readyShadowFruit(hr);
  if (!ready.length) {
    const pending = remaining.length;
    u.send(
      pending
        ? `Nothing ripe yet (${pending} growing).`
        : "No shadow fruit pending. Eat fruit here first.",
    );
    return;
  }
  const nextRoom = writeShadowPending(hr, remaining);
  await persistRoomHedge(u, u.here.id, nextRoom);
  const lines = ["Shadow Garden harvest:"];
  for (const p of ready) {
    const obj = await createFruitObject(u, u.me.id, p.slug);
    // mark as shadow via note on object if possible
    if (obj?.id) {
      try {
        const d = itemData(obj) ?? { key: p.slug };
        await u.db.modify(obj.id, "$set", {
          "data.cofd_item": {
            ...d,
            note: "shadow-garden copy — no real benefit",
            key: p.slug,
            kind: "goblin-fruit",
          },
        });
      } catch {
        // best-effort
      }
    }
    const name = findFruit(p.slug)?.name ?? p.slug;
    lines.push(`  %cy${name}%cn (shadow — no benefit if eaten)`);
  }
  u.send(lines.join("\n"));
}
