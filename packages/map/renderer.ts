import { divider, footer, header } from "ursamu";
import type {
  EntityMarker,
  NeighborhoodSample,
  RenderInput,
  RenderTile,
  TileOverlay,
  VisibilityMask,
} from "./schemas.ts";
import { coordKey, VIEWPORT_COLS } from "./schemas.ts";

const INFRA_KINDS = new Set(["infrastructure", "landmark", "hazard", "cache"]);
// Fog defaults — legend.fog / legend.fogMemory are not threaded through
// RenderInput yet; hardcode the schema defaults documented in MapLegend.
const FOG_GLYPH = "?";
const FOG_MEMORY_GLYPH = ".";

const stripColor = (s: string): string => s.replace(/%c[a-z]/gi, "");
const visibleLen = (s: string): number => stripColor(s).length;

const safeText = (s: string): string =>
  stripColor(s).replace(/\[/g, "(").replace(/\]/g, ")");

function padRight(s: string, w: number): string {
  const pad = w - visibleLen(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

function rjust(s: string, w: number): string {
  const pad = w - visibleLen(s);
  return pad > 0 ? " ".repeat(pad) + s : s;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur.length) { cur = w; continue; }
    if (visibleLen(cur) + 1 + visibleLen(w) <= width) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function fitLines(lines: string[], height: number, width: number): string[] {
  const out = lines.slice(0, height);
  if (out.length === height && lines.length > height) {
    const last = out[height - 1];
    const max = width - 3;
    out[height - 1] = visibleLen(last) > max
      ? last.slice(0, max) + "..."
      : (last + " ...").slice(0, width);
  }
  while (out.length < height) out.push("");
  return out;
}

function pickPhrase(list: string[] | undefined, idx: number): string {
  if (!list || !list.length) return "";
  return list[idx % list.length];
}

function composeTopography(nb: NeighborhoodSample): string {
  const c = nb.centre.biome;
  const self = pickPhrase(c.phrases.self, 0) || `${c.name} dominates the area.`;
  const dirs: Array<["N" | "S" | "E" | "W", string]> = [
    ["N", "north"], ["E", "east"], ["S", "south"], ["W", "west"],
  ];
  const seen = new Set<string>([c.id]);
  const frags: string[] = [];
  for (const [k, label] of dirs) {
    const b = nb.ring[k].biome;
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const ph = pickPhrase(b.phrases.adjacent ?? b.phrases.self, frags.length);
    if (ph) frags.push(`To the ${label}, ${ph.charAt(0).toLowerCase()}${ph.slice(1)}`);
    if (frags.length >= 2) break;
  }
  return [self, ...frags].join(" ");
}

function renderTileGlyph(
  tile: RenderTile,
  centre: { x: number; y: number; z: number },
  visibility: VisibilityMask | undefined,
): string {
  if (!visibility) return tile.glyph;
  const key = coordKey(tile.coord);
  const isCentre = tile.coord.x === centre.x &&
    tile.coord.y === centre.y && tile.coord.z === centre.z;
  if (isCentre || visibility.live.has(key)) return tile.glyph;
  const mem = visibility.memory.get(key);
  const g = mem?.glyph ?? FOG_MEMORY_GLYPH;
  if (mem) return `%cn${g}%cn`;
  return `%cn${FOG_GLYPH}%cn`;
}

function buildMinimapLines(
  tiles: RenderTile[][],
  centre: { x: number; y: number; z: number },
  visibility: VisibilityMask | undefined,
): string[] {
  return tiles.map((row) => {
    const cells = row.map((t) =>
      `${renderTileGlyph(t, centre, visibility)} `
    ).join("");
    return " " + cells.replace(/ $/, "");
  });
}

function buildSplitBody(input: RenderInput): string[] {
  const map = buildMinimapLines(input.tiles, input.centre, input.visibility);
  const height = map.length;
  const mapW = map.length ? visibleLen(map[0]) : 0;
  const sepW = 3;
  const rightW = VIEWPORT_COLS - mapW - sepW;
  const heading = "%chTOPOGRAPHY & CLIMATE%cn";
  const prose = safeText(composeTopography(input.neighborhood));
  const wrapped = [heading, ...wrapText(prose, rightW)];
  const right = fitLines(wrapped, height, rightW);
  const lines: string[] = [];
  for (let i = 0; i < height; i++) {
    const l = padRight(map[i] ?? "", mapW);
    const r = padRight(right[i] ?? "", rightW);
    lines.push(padRight(l + " | " + r, VIEWPORT_COLS));
  }
  return lines;
}

function buildInfrastructure(overlays: TileOverlay[]): string[] {
  const rows = overlays
    .filter((o) => o.kind && INFRA_KINDS.has(o.kind))
    .map((o) => {
      const tag = o.faction ? ` (${safeText(o.faction)})` : "";
      const name = safeText(o.name ?? o.kind ?? "Marker");
      const glyph = safeText(o.glyph ?? "#");
      return `  ${glyph} (${o.x}, ${o.y}) ${name}${tag}`;
    });
  return rows.length ? rows : ["  (none surveyed)"];
}

// Visibility contract: EntityMarkers lack coords, so upstream (format handler)
// MUST filter entities outside `visibility.live` before constructing RenderInput.
function buildContacts(entities: EntityMarker[]): string[] {
  const groups = new Map<string, { e: EntityMarker; n: number }>();
  for (const e of entities) {
    const key = e.groupKey ?? `${e.name}|${e.faction ?? ""}|${e.status ?? ""}`;
    const g = groups.get(key);
    if (g) g.n += 1;
    else groups.set(key, { e, n: 1 });
  }
  const rows: string[] = [];
  for (const { e, n } of groups.values()) {
    const fac = e.faction ? ` (${safeText(e.faction)})` : "";
    const status = e.status ? ` ${safeText(e.status)}` : " are present.";
    const name = safeText(e.name);
    rows.push(n > 1 ? `  ${n}x ${name}${fac}${status}` : `  ${name}${fac}${status}`);
  }
  return rows.length ? rows : ["  No contacts on sensors."];
}

function buildAdjacent(adj: RenderInput["adjacency"]): string {
  return `  N (${safeText(adj.N)}), S (${safeText(adj.S)}), ` +
    `E (${safeText(adj.E)}), W (${safeText(adj.W)})`;
}

function truncate(line: string): string {
  return visibleLen(line) > VIEWPORT_COLS
    ? line.slice(0, VIEWPORT_COLS)
    : line;
}

export function renderMap(input: RenderInput): string {
  const { x, y, z } = input.centre;
  const stamp = rjust(`LOC: (${x}, ${y}) Z: ${z}`, VIEWPORT_COLS);
  const out: string[] = [];
  out.push(header(safeText(input.sectorTitle)));
  if (input.spectator) {
    const indicator = "%cy(SPECTATING)%cn";
    const pad = Math.max(0, Math.floor((VIEWPORT_COLS - visibleLen(indicator)) / 2));
    out.push(" ".repeat(pad) + indicator);
  }
  out.push(stamp);
  out.push(...buildSplitBody(input));
  out.push(divider("NOTABLE INFRASTRUCTURE"));
  out.push(...buildInfrastructure(input.overlays));
  out.push(divider("SECTOR CONTACTS"));
  out.push(...buildContacts(input.entities));
  out.push(divider("ADJACENT SECTORS"));
  out.push(buildAdjacent(input.adjacency));
  if (input.infoLines && input.infoLines.length > 0) {
    out.push(divider("INTEL"));
    for (const line of input.infoLines) out.push("  " + line);
  }
  out.push(footer());
  return out.map((l) => l.split("\n").map(truncate).join("\n")).join("\n");
}
