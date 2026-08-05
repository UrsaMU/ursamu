// Builder/admin +map switches: authorize, clear, stats, prune.

import { DBO } from "ursamu";
import type { IUrsamuSDK } from "ursamu";
import {
  OVERLAY_COLLECTION,
  type TileOverlay,
} from "./schemas.ts";
import {
  clearOverlay,
  countOverlays,
  getOverlay,
  setOverlay,
  validateOverlay,
} from "./state.ts";
import {
  countEntities,
  listAllEntities,
  pruneOrphanEntities,
} from "./entities.ts";
import { parseCoord } from "./commands_internals.ts";

type StoredOverlay = TileOverlay & { id: string };

function isAdmin(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function isBuilder(u: IUrsamuSDK): boolean {
  return u.me.flags.has("builder") || isAdmin(u);
}

/** Builder: +map/authorize x y [z] [realm]=kind:glyph:name */
export async function handleAuthorize(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u)) {
    u.send("%crPermission denied — builder+ only.%cn");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +map/authorize <x> <y> [z] [realm]=" +
        "<kind>:<glyph>:<name>",
    );
    return;
  }
  const coord = parseCoord(rest.slice(0, eq).trim());
  const spec = rest.slice(eq + 1).trim();
  if (!coord || !spec) {
    u.send(
      "Usage: +map/authorize <x> <y> [z] [realm]=" +
        "<kind>:<glyph>:<name>",
    );
    return;
  }
  const parts = spec.split(":");
  if (parts.length < 3) {
    u.send(
      "%crNeed kind:glyph:name " +
        "(e.g. infrastructure:#:Bunker).%cn",
    );
    return;
  }
  const kind = parts[0]!.trim();
  const glyph = parts[1]!.trim();
  const name = parts.slice(2).join(":").trim();
  const overlay: TileOverlay = {
    key: `${coord.x},${coord.y},${coord.z}`,
    x: coord.x,
    y: coord.y,
    z: coord.z,
    realm: coord.realm,
    kind,
    glyph,
    name,
  };
  if (!validateOverlay(overlay)) {
    u.send(
      "%crInvalid overlay " +
        "(glyph must be 1 char; no [ ] in text).%cn",
    );
    return;
  }
  await setOverlay(overlay);
  u.send(
    `%cgOverlay set at (${coord.x}, ${coord.y}, ${coord.z}): ` +
      `${glyph} ${name} [${kind}].%cn`,
  );
}

export async function handleClear(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u)) {
    u.send("%crPermission denied — builder+ only.%cn");
    return;
  }
  const coord = parseCoord(rest);
  if (!coord) {
    u.send("Usage: +map/clear <x> <y> [z] [realm]");
    return;
  }
  const existing = await getOverlay(coord);
  if (!existing) {
    u.send("%cyNo overlay at that coordinate.%cn");
    return;
  }
  await clearOverlay(coord);
  u.send(
    `%cgCleared overlay at (${coord.x}, ${coord.y}, ${coord.z}).%cn`,
  );
}

export async function handlePrune(u: IUrsamuSDK): Promise<void> {
  if (!isAdmin(u)) {
    u.send("%crPermission denied — admin only.%cn");
    return;
  }
  const n = await pruneOrphanEntities();
  u.send(
    n > 0
      ? `%cgPruned ${n} orphan map entit${n === 1 ? "y" : "ies"}.%cn`
      : "%cyNo orphan entities found.%cn",
  );
}

export async function handleStats(u: IUrsamuSDK): Promise<void> {
  if (!isBuilder(u)) {
    u.send("%crPermission denied — builder+ only.%cn");
    return;
  }
  const overlays = await new DBO<StoredOverlay>(OVERLAY_COLLECTION).all();
  const byKind: Record<string, number> = {};
  for (const o of overlays) {
    const k = o.kind ?? "(none)";
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const kindLines = Object.entries(byKind)
    .map(([k, n]) => `    ${k}: ${n}`)
    .join("\n");
  const ents = await listAllEntities();
  const entLines = ents.slice(0, 20).map((e) => {
    const c = e.coord;
    return `    ${e.id} @(${c.x},${c.y},${c.z}) ` +
      `${e.name} c=${e.containerId ?? "-"}`;
  }).join("\n");
  const more = ents.length > 20
    ? `\n    … +${ents.length - 20} more`
    : "";
  const oCount = await countOverlays();
  const eCount = await countEntities();
  u.send(
    `%chMap stats%cn\n` +
      `  overlays: ${oCount}\n${kindLines || "    (none)"}\n` +
      `  entities: ${eCount}\n${entLines || "    (none)"}${more}\n` +
      `  tip: +map/prune removes orphan entities`,
  );
}
