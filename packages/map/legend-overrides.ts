// Persisted staff legend pack: biomes + Whittaker (Perlin) bands.
// Stored in DBO `map.legend_overrides`, applied on top of the theme base.

import { DBO } from "ursamu";
import type {
  BiomeDefinition,
  MapConfig,
  MapLegend,
  WhittakerCell,
} from "./schemas.ts";
import { DEFAULT_REALM } from "./schemas.ts";
import {
  cloneMapConfig,
  getBaseMapConfig,
  getMapConfig,
  setActiveMapConfig,
} from "./mapconfig.ts";
import { getPluginConfigSync } from "./plugin-config.ts";

export const LEGEND_OVERRIDE_COLLECTION = "map.legend_overrides";

const TRAVEL = new Set([
  "trivial",
  "easy",
  "rough",
  "hazard",
  "impassable",
]);

/** Legacy glyph/name patch (pre-3.2). */
export interface BiomeOverride {
  glyph?: string;
  name?: string;
}

/** One staff-editable biome + its Perlin band. */
export interface LegendBiomeRow {
  id: string;
  name: string;
  glyph: string;
  color?: string;
  traversal?: string;
  /** Elevation band 0..1 (Whittaker / Perlin). */
  elevMin: number;
  elevMax: number;
  /** Moisture band 0..1. */
  moistMin: number;
  moistMax: number;
}

export interface LegendOverrideRecord {
  id: string;
  realm: string;
  /** Full biome pack (add/delete/rename). */
  biomeList?: BiomeDefinition[];
  /** Full Whittaker matrix matching biomeList. */
  matrix?: WhittakerCell[];
  legend?: Partial<MapLegend>;
  /** Legacy patch map. */
  biomes?: Record<string, BiomeOverride>;
  updatedAt?: number;
}

export interface LegendDTO {
  realm: string;
  theme: string;
  biomes: LegendBiomeRow[];
  legend: MapLegend;
  hasOverrides: boolean;
}

const store = new DBO<LegendOverrideRecord>(LEGEND_OVERRIDE_COLLECTION);

function realmKey(realm: string): string {
  const r = realm.trim() || DEFAULT_REALM;
  return r;
}

function isGlyph(s: unknown): s is string {
  return typeof s === "string" && s.length === 1 &&
    s.charCodeAt(0) <= 0xff;
}

function isSlug(s: string): boolean {
  return /^[a-z][a-z0-9_]{0,31}$/.test(s);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 1000) / 1000;
}

function sanitizeGlyphList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const g of raw) {
    if (isGlyph(g)) out.push(g);
  }
  return out;
}

function sanitizeLegend(
  raw: unknown,
): Partial<MapLegend> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<MapLegend> = {};
  const t = sanitizeGlyphList(o.terrain);
  const i = sanitizeGlyphList(o.infrastructure);
  const e = sanitizeGlyphList(o.entities);
  if (t) out.terrain = t;
  if (i) out.infrastructure = i;
  if (e) out.entities = e;
  if (isGlyph(o.fog)) out.fog = o.fog;
  if (isGlyph(o.fogMemory)) out.fogMemory = o.fogMemory;
  return Object.keys(out).length ? out : undefined;
}

/** First matrix cell for a biome id (list order = priority). */
function bandFor(
  matrix: WhittakerCell[],
  biomeId: string,
): {
  elevMin: number;
  elevMax: number;
  moistMin: number;
  moistMax: number;
} {
  const hit = matrix.find((c) => c.biome === biomeId);
  if (!hit) {
    return { elevMin: 0, elevMax: 1, moistMin: 0, moistMax: 1 };
  }
  return {
    elevMin: hit.elevation[0],
    elevMax: hit.elevation[1],
    moistMin: hit.moisture[0],
    moistMax: hit.moisture[1],
  };
}

function rowsFromConfig(cfg: MapConfig): LegendBiomeRow[] {
  return cfg.biomes.map((b) => {
    const band = bandFor(cfg.matrix, b.id);
    return {
      id: b.id,
      name: b.name,
      glyph: b.glyph,
      color: b.color,
      traversal: b.traversal,
      ...band,
    };
  });
}

function defaultPhrases(name: string): BiomeDefinition["phrases"] {
  const n = name.trim() || "terrain";
  return {
    self: [`${n} covers the ground here`],
    adjacent: [`${n} nearby`],
  };
}

function biomeFromRow(
  row: LegendBiomeRow,
  prev?: BiomeDefinition,
): BiomeDefinition {
  const travel = row.traversal && TRAVEL.has(row.traversal)
    ? row.traversal as BiomeDefinition["traversal"]
    : prev?.traversal ?? "easy";
  const def: BiomeDefinition = {
    id: row.id,
    name: row.name,
    glyph: row.glyph,
    phrases: prev?.phrases ?? defaultPhrases(row.name),
    traversal: travel,
  };
  if (row.color && typeof row.color === "string") {
    def.color = row.color.slice(0, 16);
  } else if (prev?.color) {
    def.color = prev.color;
  }
  if (typeof prev?.occludes === "number") {
    def.occludes = prev.occludes;
  }
  return def;
}

function matrixFromRows(rows: LegendBiomeRow[]): WhittakerCell[] {
  return rows.map((r) => {
    let e0 = clamp01(r.elevMin);
    let e1 = clamp01(r.elevMax);
    let m0 = clamp01(r.moistMin);
    let m1 = clamp01(r.moistMax);
    if (e1 < e0) [e0, e1] = [e1, e0];
    if (m1 < m0) [m0, m1] = [m1, m0];
    return {
      elevation: [e0, e1] as [number, number],
      moisture: [m0, m1] as [number, number],
      biome: r.id,
    };
  });
}

function syncTerrainLegend(cfg: MapConfig): void {
  const glyphs = cfg.biomes.map((b) => b.glyph);
  const seen = new Set<string>();
  const terrain: string[] = [];
  for (const g of glyphs) {
    if (!seen.has(g)) {
      terrain.push(g);
      seen.add(g);
    }
  }
  cfg.legend = {
    ...cfg.legend,
    terrain: terrain.length ? terrain : cfg.legend.terrain,
  };
}

export function applyOverrideToConfig(
  base: MapConfig,
  ov: Pick<
    LegendOverrideRecord,
    "biomes" | "legend" | "biomeList" | "matrix"
  >,
): MapConfig {
  const cfg = cloneMapConfig(base);

  if (ov.biomeList && ov.biomeList.length > 0) {
    cfg.biomes = ov.biomeList.map((b) => ({ ...b }));
  } else if (ov.biomes) {
    cfg.biomes = cfg.biomes.map((b: BiomeDefinition) => {
      const p = ov.biomes?.[b.id];
      if (!p) return b;
      return {
        ...b,
        glyph: p.glyph ?? b.glyph,
        name: p.name ?? b.name,
      };
    });
  }

  if (ov.matrix && ov.matrix.length > 0) {
    cfg.matrix = ov.matrix.map((c) => ({
      elevation: [...c.elevation] as [number, number],
      moisture: [...c.moisture] as [number, number],
      biome: c.biome,
    }));
  }

  if (ov.legend) {
    cfg.legend = {
      ...cfg.legend,
      ...ov.legend,
      terrain: ov.legend.terrain ?? cfg.legend.terrain,
      infrastructure: ov.legend.infrastructure ??
        cfg.legend.infrastructure,
      entities: ov.legend.entities ?? cfg.legend.entities,
    };
  }

  syncTerrainLegend(cfg);
  return cfg;
}

export async function loadOverride(
  realm: string,
): Promise<LegendOverrideRecord | null> {
  const id = realmKey(realm);
  const rec = await store.findOne({ id });
  return rec ?? null;
}

export async function applyStoredOverride(
  realm: string,
): Promise<void> {
  const id = realmKey(realm);
  const base = getBaseMapConfig(id);
  const ov = await loadOverride(id);
  if (!ov) {
    setActiveMapConfig(id, base);
    return;
  }
  setActiveMapConfig(
    id,
    applyOverrideToConfig(base, {
      biomes: ov.biomes,
      biomeList: ov.biomeList,
      matrix: ov.matrix,
      legend: ov.legend,
    }),
  );
}

export async function applyAllStoredOverrides(): Promise<void> {
  const rows = await store.all();
  const realms = new Set<string>([DEFAULT_REALM]);
  for (const r of rows) {
    if (r.realm) realms.add(r.realm);
    if (r.id) realms.add(r.id);
  }
  for (const realm of realms) {
    await applyStoredOverride(realm);
  }
}

function packFingerprint(cfg: MapConfig): string {
  return JSON.stringify({
    b: cfg.biomes.map((x) => [
      x.id,
      x.glyph,
      x.name,
      x.traversal ?? "",
    ]),
    m: cfg.matrix,
    l: cfg.legend,
  });
}

export function legendDTO(realm: string): LegendDTO {
  const id = realmKey(realm);
  const cfg = getMapConfig(id);
  const base = getBaseMapConfig(id);
  const theme = (getPluginConfigSync().theme ?? "default")
    .toLowerCase();
  return {
    realm: id,
    theme,
    biomes: rowsFromConfig(cfg),
    legend: {
      terrain: [...cfg.legend.terrain],
      infrastructure: [...cfg.legend.infrastructure],
      entities: [...cfg.legend.entities],
      fog: cfg.legend.fog,
      fogMemory: cfg.legend.fogMemory,
    },
    hasOverrides: packFingerprint(cfg) !== packFingerprint(base),
  };
}

export interface SaveLegendInput {
  realm?: string;
  /** Full pack replace (add / delete / rename / bands). */
  biomes?: Array<Partial<LegendBiomeRow> & { id?: string }>;
  legend?: Partial<MapLegend>;
  /** When true, biomes array is the complete pack. Default true. */
  replace?: boolean;
}

function parseRow(
  raw: unknown,
  idx: number,
): LegendBiomeRow | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: `biome[${idx}] must be an object` };
  }
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim().toLowerCase();
  if (!isSlug(id)) {
    return {
      error: `biome[${idx}] id must be slug ` +
        `(a-z, 0-9, _), start letter)`,
    };
  }
  if (!isGlyph(o.glyph)) {
    return { error: `biome[${idx}] needs a 1-char glyph` };
  }
  const nameRaw = typeof o.name === "string" ? o.name.trim() : "";
  const name = nameRaw.slice(0, 80) || id;
  if (/[\[\]]/.test(name)) {
    return { error: `biome[${idx}] name cannot contain [ ]` };
  }
  let traversal: string | undefined;
  if (typeof o.traversal === "string" && o.traversal) {
    if (!TRAVEL.has(o.traversal)) {
      return { error: `biome[${idx}] bad traversal` };
    }
    traversal = o.traversal;
  }
  const elevMin = clamp01(Number(o.elevMin ?? 0));
  const elevMax = clamp01(Number(o.elevMax ?? 1));
  const moistMin = clamp01(Number(o.moistMin ?? 0));
  const moistMax = clamp01(Number(o.moistMax ?? 1));
  const row: LegendBiomeRow = {
    id,
    name,
    glyph: o.glyph,
    elevMin,
    elevMax,
    moistMin,
    moistMax,
  };
  if (traversal) row.traversal = traversal;
  if (typeof o.color === "string" && o.color.trim()) {
    row.color = o.color.trim().slice(0, 16);
  }
  return row;
}

export function parseLegendBody(
  body: unknown,
): SaveLegendInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const out: SaveLegendInput = {};
  if (typeof b.realm === "string") out.realm = b.realm;
  if (b.replace === false) out.replace = false;
  else out.replace = true;

  if (b.biomes !== undefined) {
    if (!Array.isArray(b.biomes)) {
      return { error: "biomes must be an array" };
    }
    if (b.biomes.length < 1) {
      return { error: "at least one biome required" };
    }
    if (b.biomes.length > 48) {
      return { error: "too many biomes (max 48)" };
    }
    const rows: LegendBiomeRow[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < b.biomes.length; i++) {
      const parsed = parseRow(b.biomes[i], i);
      if ("error" in parsed) return parsed;
      if (seen.has(parsed.id)) {
        return { error: `duplicate biome id “${parsed.id}”` };
      }
      seen.add(parsed.id);
      rows.push(parsed);
    }
    out.biomes = rows;
  }

  if (b.legend !== undefined) {
    const leg = sanitizeLegend(b.legend);
    if (leg) out.legend = leg;
    else if (b.legend && typeof b.legend === "object") {
      out.legend = {};
    } else {
      return { error: "invalid legend" };
    }
  }

  if (!out.biomes && out.legend === undefined) {
    return { error: "biomes or legend required" };
  }
  return out;
}

export async function saveLegendOverrides(
  input: SaveLegendInput,
): Promise<LegendDTO> {
  const id = realmKey(input.realm ?? DEFAULT_REALM);
  const base = getBaseMapConfig(id);
  const prev = await loadOverride(id);
  const active = getMapConfig(id);

  let biomeList: BiomeDefinition[] | undefined;
  let matrix: WhittakerCell[] | undefined;
  let legacyBiomes: Record<string, BiomeOverride> | undefined;

  if (Array.isArray(input.biomes) && input.biomes.length) {
    const rows = input.biomes as LegendBiomeRow[];
    if (input.replace !== false) {
      const prevById = new Map(
        active.biomes.map((b) => [b.id, b]),
      );
      biomeList = rows.map((r) =>
        biomeFromRow(r, prevById.get(r.id))
      );
      matrix = matrixFromRows(rows);
    } else {
      // Legacy patch path (glyph/name only).
      legacyBiomes = {};
      for (const row of rows) {
        if (!base.biomes.some((b) => b.id === row.id)) continue;
        const baseB = base.biomes.find((b) => b.id === row.id)!;
        const patch: BiomeOverride = {};
        if (row.glyph !== baseB.glyph) patch.glyph = row.glyph;
        if (row.name !== baseB.name) patch.name = row.name;
        if (Object.keys(patch).length) {
          legacyBiomes[row.id] = patch;
        }
      }
      if (!Object.keys(legacyBiomes).length) {
        legacyBiomes = undefined;
      }
    }
  } else if (prev?.biomeList) {
    biomeList = prev.biomeList;
    matrix = prev.matrix;
  } else if (prev?.biomes) {
    legacyBiomes = prev.biomes;
  }

  let leg: Partial<MapLegend> | undefined;
  if (input.legend !== undefined) {
    leg = sanitizeLegend(input.legend) ?? {};
  } else if (prev?.legend) {
    leg = prev.legend;
  }

  const rec: LegendOverrideRecord = {
    id,
    realm: id,
    updatedAt: Date.now(),
  };
  if (biomeList?.length) {
    rec.biomeList = biomeList;
    rec.matrix = matrix;
  } else if (legacyBiomes) {
    rec.biomes = legacyBiomes;
  }
  if (leg && Object.keys(leg).length) rec.legend = leg;

  const empty = !rec.biomeList && !rec.biomes && !rec.legend;
  if (empty) {
    await store.delete({ id });
    setActiveMapConfig(id, base);
    return legendDTO(id);
  }

  await store.update({ id }, rec);
  await applyStoredOverride(id);
  return legendDTO(id);
}

export async function resetLegendOverrides(
  realm: string,
): Promise<LegendDTO> {
  const id = realmKey(realm);
  await store.delete({ id });
  setActiveMapConfig(id, getBaseMapConfig(id));
  return legendDTO(id);
}

/** Suggest a free slug from a display name. */
export function suggestBiomeId(
  name: string,
  taken: Set<string>,
): string {
  let base = name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  if (!base || !/^[a-z]/.test(base)) base = `biome_${base || "x"}`;
  if (!isSlug(base)) base = "biome_new";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const cand = `${base.slice(0, 28)}_${n}`;
    if (!taken.has(cand) && isSlug(cand)) return cand;
  }
  return `biome_${Date.now().toString(36)}`;
}
