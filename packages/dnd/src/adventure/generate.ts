/**
 * Procedural adventure from a dungeon/camp skin.
 * Linear chain of rooms, fodder along the way, boss + loot at end.
 * Foe counts scale with adventure party size (PCs + hirelings).
 */
import type {
  AdventureDef,
  AdvMobDef,
  AdvPropDef,
  AdvRoomDef,
  DungeonSkin,
  SkinPropPool,
} from "./types.ts";
import {
  bossGuardCount,
  scaleFodderRange,
} from "./party.ts";

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}

function randInt(
  min: number,
  max: number,
  rng: () => number,
): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function rollProp(
  room: string,
  pool: SkinPropPool | undefined,
  kind: string,
  rng: () => number,
): AdvPropDef | null {
  if (!pool || !pool.names?.length) return null;
  if (rng() > pool.chance) return null;
  const name = pick(pool.names, rng);
  const descs = pool.descs?.length ? pool.descs : [
    `A ${kind} marked by time and use.`,
  ];
  const description = pick(descs, rng);
  const table = pool.tables?.length
    ? pick(pool.tables, rng)
    : undefined;
  return {
    room,
    name,
    kind,
    description,
    table: kind === "chest" ? table : undefined,
  };
}

export type GenerateOpts = {
  /** PCs + hirelings present when the delve starts. Default 1. */
  partySize?: number;
  rng?: () => number;
};

/**
 * Build a fresh AdventureDef from a skin.
 * runSlug should be unique per delve (e.g. goblin-warren-k3f9).
 */
export function generateFromSkin(
  skin: DungeonSkin,
  runSlug: string,
  rngOrOpts: (() => number) | GenerateOpts = Math.random,
): AdventureDef {
  const opts: GenerateOpts = typeof rngOrOpts === "function"
    ? { rng: rngOrOpts }
    : rngOrOpts;
  const rng = opts.rng ?? Math.random;
  const partySize = Math.max(1, Math.floor(opts.partySize ?? 1));

  const n = randInt(skin.roomsMin, skin.roomsMax, rng);
  const namePool = shuffle(skin.roomNames, rng);
  const descPool = shuffle(skin.roomDescs, rng);

  const rooms: AdvRoomDef[] = [];
  for (let i = 0; i < n; i++) {
    const key = i === 0
      ? "entry"
      : i === n - 1
      ? "boss"
      : `r${i}`;
    const baseName = namePool[i % namePool.length] ??
      `Chamber ${i + 1}`;
    // Boss room prefers "end-ish" names if available
    const name = i === n - 1 && namePool.length
      ? (namePool[namePool.length - 1] ?? baseName)
      : baseName;
    rooms.push({
      key,
      name,
      description: descPool[i % descPool.length] ??
        "Stone and shadow.",
    });
  }

  const exits: AdventureDef["exits"] = [];
  const deeper = skin.kind === "camp"
    ? ["In", "Camp", "North", "N", "Deeper"]
    : ["In", "Deeper", "North", "N", "Forward"];
  const back = skin.kind === "camp"
    ? ["Out", "Back", "South", "S", "Trail"]
    : ["Out", "Back", "South", "S", "Retreat"];

  for (let i = 0; i < n - 1; i++) {
    const a = rooms[i]!.key;
    const b = rooms[i + 1]!.key;
    const dLabel = deeper.slice(0, 3 + (i % 2)).join(";");
    const bLabel = back.slice(0, 3 + (i % 2)).join(";");
    exits.push({ from: a, to: b, name: dLabel });
    exits.push({ from: b, to: a, name: bLabel });
  }

  // Optional side spur off a middle room
  if (n >= 4 && rng() < 0.35) {
    const mid = 1 + Math.floor(rng() * (n - 2));
    const spurKey = "spur";
    rooms.push({
      key: spurKey,
      name: namePool[(n + 1) % namePool.length] ?? "Side Chamber",
      description: descPool[(n + 1) % descPool.length] ??
        "A cramped side pocket off the main path.",
    });
    const hub = rooms[mid]!.key;
    exits.push({
      from: hub,
      to: spurKey,
      name: "Side;East;E;Alcove",
    });
    exits.push({
      from: spurKey,
      to: hub,
      name: "Back;West;W;Main",
    });
  }

  const mobs: AdvMobDef[] = [];
  const [fMin, fMax] = scaleFodderRange(
    skin.fodderPerRoom,
    partySize,
  );
  for (let i = 0; i < n - 1; i++) {
    const key = rooms[i]!.key;
    const count = randInt(fMin, fMax, rng);
    for (let k = 0; k < count; k++) {
      const pool = pick(skin.fodder, rng);
      mobs.push({
        room: key,
        name: pick(pool.names, rng),
        template: pool.template,
      });
    }
  }

  // Boss at end + guards scaled to party
  const bossRoom = rooms[n - 1]!.key;
  mobs.push({
    room: bossRoom,
    name: pick(skin.boss.names, rng),
    template: skin.boss.template,
  });
  const guards = bossGuardCount(partySize, rng);
  for (let g = 0; g < guards && skin.fodder.length; g++) {
    const pool = pick(skin.fodder, rng);
    mobs.push({
      room: bossRoom,
      name: pick(pool.names, rng),
      template: pool.template,
    });
  }

  const props: AdvPropDef[] = [];
  const chests: AdventureDef["chests"] = [];

  // Boss always has end loot chest
  const bossChestName = skin.kind === "camp"
    ? pick(
      skin.props.chest?.names ?? ["Captain's Lockbox"],
      rng,
    )
    : pick(
      skin.props.chest?.names ?? ["Boss Chest", "Hoard"],
      rng,
    );
  chests!.push({
    room: bossRoom,
    name: bossChestName,
    table: skin.bossLoot,
  });
  props.push({
    room: bossRoom,
    name: bossChestName,
    kind: "chest",
    description: "Heavy with the weight of a final prize.",
    table: skin.bossLoot,
  });

  // Props in non-boss rooms (and spur)
  for (const r of rooms) {
    if (r.key === bossRoom) continue;
    for (const kind of [
      "chest",
      "view",
      "altar",
      "campfire",
    ] as const) {
      // Avoid second chest competing with boss hoard too often
      if (kind === "chest" && rng() > 0.85) continue;
      const pool = skin.props[kind];
      const p = rollProp(r.key, pool, kind, rng);
      if (!p) continue;
      // One mid-chest max besides boss loot
      if (kind === "chest") {
        const already = props.some((x) => x.kind === "chest");
        if (already) continue;
        if (p.table) {
          chests!.push({
            room: r.key,
            name: p.name,
            table: p.table,
          });
        }
      }
      props.push(p);
    }
  }

  return {
    slug: runSlug,
    name: skin.name,
    tier: skin.tier,
    book: skin.book,
    summary: skin.summary,
    entryKey: "entry",
    linkFromWorld: skin.linkFromWorld,
    exitNameToSite: skin.exitNameToSite,
    exitNameFromSite: skin.exitNameFromSite,
    skin: skin.slug,
    kind: skin.kind,
    partySize,
    rooms,
    exits,
    mobs,
    chests,
    props,
  };
}

/** Short unique run id. */
export function makeRunSlug(skinSlug: string): string {
  const r = Math.random().toString(36).slice(2, 7);
  return `${skinSlug}-${r}`;
}
