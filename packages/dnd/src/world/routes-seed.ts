/**
 * Materialize overland road legs between seeded towns.
 */
import { DBO, dbojs } from "@ursamu/ursamu";
import {
  createExit,
  createRoom,
  exitExists,
  getTownSeed,
} from "./seed.ts";
import { listRoutes, type RouteDef } from "./routes.ts";

export interface RouteSeedRec {
  id: string;
  routeSlug: string;
  legs: Record<string, string>;
  at: number;
}

const routeDb = new DBO<RouteSeedRec>("dnd.routes");

async function linkTwo(
  fromId: string,
  toId: string,
  nameA: string,
  nameB: string,
  tag: string,
): Promise<void> {
  if (!(await exitExists(fromId, toId))) {
    await createExit(fromId, toId, nameA, tag);
  }
  if (!(await exitExists(toId, fromId))) {
    await createExit(toId, fromId, nameB, tag);
  }
}

function edgeNames(
  route: RouteDef,
  i: number,
  last: number,
): [string, string] {
  const forward = route.fromExit || "East;E;Onward;Road";
  const back = route.toExit || "West;W;Back;Road";
  const fName = i === 0
    ? forward
    : i === last
    ? (route.toExit || "East;E;Onward")
    : "East;E;Onward;Forward";
  const bName = i === 0
    ? "West;W;Back;Gate"
    : i === last
    ? back
    : "West;W;Back";
  return [fName, bName];
}

async function seedOneRoute(
  route: RouteDef,
  opts: { force?: boolean },
): Promise<string> {
  const existing = await routeDb.queryOne({
    id: `route:${route.slug}`,
  });
  if (existing && !opts.force) {
    return `Route ${route.slug} ok.`;
  }

  const fromSeed = await getTownSeed(route.fromTown);
  const toSeed = await getTownSeed(route.toTown);
  if (!fromSeed?.rooms || !toSeed?.rooms) {
    return `Route ${route.slug}: towns not seeded.`;
  }
  const startId = fromSeed.rooms[route.fromRoom];
  const endId = toSeed.rooms[route.toRoom];
  if (!startId || !endId) {
    return `Route ${route.slug}: endpoint rooms missing.`;
  }

  const legIds: Record<string, string> = {};
  const tag = `route:${route.slug}`;
  for (const leg of route.legs) {
    if (existing?.legs?.[leg.key] && !opts.force) {
      const id = existing.legs[leg.key]!;
      const o = await dbojs.queryOne({ id });
      if (o) {
        legIds[leg.key] = id;
        continue;
      }
    }
    legIds[leg.key] = await createRoom(
      leg.name,
      leg.description,
      `route-${route.slug}-${leg.key}`,
      tag,
    );
    try {
      await dbojs.modify({ id: legIds[leg.key] }, "$set", {
        "data.dndRoute": route.slug,
        "data.dndEncounter": route.encounter ?? "whisperwood",
      });
    } catch (_e: unknown) {
      /* optional attrs */
    }
  }

  const chain = [
    startId,
    ...route.legs.map((l) => legIds[l.key]!),
    endId,
  ];
  const last = chain.length - 2;
  for (let i = 0; i < chain.length - 1; i++) {
    const [fName, bName] = edgeNames(route, i, last);
    await linkTwo(chain[i]!, chain[i + 1]!, fName, bName, tag);
  }

  const rec: RouteSeedRec = {
    id: `route:${route.slug}`,
    routeSlug: route.slug,
    legs: legIds,
    at: Date.now(),
  };
  await routeDb.update({ id: rec.id }, rec);
  return (
    `Route ${route.name}: ${route.legs.length} legs ` +
    `(#${startId}↔#${endId}).`
  );
}

export async function seedRoutes(
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const notes: string[] = [];
  for (const route of listRoutes()) {
    notes.push(await seedOneRoute(route, opts));
  }
  return {
    ok: true,
    message: notes.join(" ") || "No routes.",
  };
}

export async function routeStatusLines(): Promise<string[]> {
  const lines: string[] = [];
  for (const r of listRoutes()) {
    const row = await routeDb.queryOne({
      id: `route:${r.slug}`,
    });
    lines.push(
      row
        ? `  road ${r.slug}: ${Object.keys(row.legs).length} legs`
        : `  road ${r.slug}: not seeded`,
    );
  }
  return lines;
}
