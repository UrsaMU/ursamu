<script setup lang="ts">
/**
 * Staff map console — vehicles, sector grid, legend, marks, cleanup.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/api/client";
import { useLiveStore } from "@/stores/live";

const live = useLiveStore();
const { staffNav } = storeToRefs(live);
const route = useRoute();

/** API allows 0..32; keep UI usable on small screens. */
const RADIUS_MIN = 1;
const RADIUS_MAX = 16;
const RADIUS_DEFAULT = 5;

const pluginMeta = computed(() => {
  const hit = staffNav.value.find((p) => p.id === "map");
  return {
    title: hit?.label?.trim() || "Map",
    lede: hit?.description?.trim() ||
      "Vehicles, sector look, legend, and marks.",
  };
});

type MapEntityRow = {
  id: string;
  name?: string;
  kind?: string;
  glyph?: string;
  coord?: { x: number; y: number; z: number; realm?: string };
  containerId?: string;
  controllerId?: string;
  factionId?: string;
  vision?: number;
  hidden?: boolean;
};

type RenderTile = {
  x: number;
  y: number;
  z: number;
  glyph: string;
  authored?: boolean;
  biome?: string;
  overlayName?: string;
};

type GridCell = {
  x: number;
  y: number;
  z: number;
  glyph: string;
  authored: boolean;
  biome?: string;
  name?: string;
  isCenter: boolean;
};

type LegendBiome = {
  id: string;
  name: string;
  glyph: string;
  color?: string;
  traversal?: string;
  elevMin: number;
  elevMax: number;
  moistMin: number;
  moistMax: number;
};

type LegendBuckets = {
  terrain: string[];
  infrastructure: string[];
  entities: string[];
  fog?: string;
  fogMemory?: string;
};

const TRAVEL_OPTS = [
  "trivial",
  "easy",
  "rough",
  "hazard",
  "impassable",
] as const;

const entities = ref<MapEntityRow[]>([]);
const loading = ref(false);
const loadError = ref("");
const selectedId = ref("");
const pruneMsg = ref("");
const pruneBusy = ref(false);
const actionError = ref("");

const lookX = ref(0);
const lookY = ref(0);
const lookZ = ref(0);
const lookRealm = ref("default");
const lookRadius = ref(RADIUS_DEFAULT);
const tiles = ref<RenderTile[]>([]);
const lookBusy = ref(false);
const lookError = ref("");
const lookLabel = ref("Origin (0, 0)");

/** Currently selected tile on the sector grid (fills mark X/Y). */
const pickX = ref(0);
const pickY = ref(0);
const pickZ = ref(0);

const markX = ref(0);
const markY = ref(0);
const markZ = ref(0);
const markName = ref("");
const markGlyph = ref("#");
const markBusy = ref(false);
const markMsg = ref("");

const legendTheme = ref("default");
const legendBiomes = ref<LegendBiome[]>([]);
const legendFog = ref("?");
const legendFogMem = ref(".");
const legendHasOverrides = ref(false);
const legendBusy = ref(false);
const legendMsg = ref("");
const legendDirty = ref(false);

const selected = computed(() =>
  entities.value.find((e) => e.id === selectedId.value) ?? null,
);

const summaryLine = computed(() => {
  if (loading.value && !entities.value.length) return "Loading…";
  const n = entities.value.length;
  const realm = lookRealm.value || "default";
  const theme = legendTheme.value || "default";
  return `${n} vehicle${n === 1 ? "" : "s"} · realm ${realm} · ${theme}`;
});

const pickLabel = computed(() => {
  const z = pickZ.value;
  return z
    ? `${pickX.value}, ${pickY.value}, ${z}`
    : `${pickX.value}, ${pickY.value}`;
});

const gridSize = computed(() => 2 * Number(lookRadius.value) + 1);

const sectorGrid = computed((): GridCell[][] => {
  const r = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Number(lookRadius.value) || RADIUS_DEFAULT));
  const cx = lookX.value;
  const cy = lookY.value;
  const cz = lookZ.value;
  const byKey = new Map<string, RenderTile>();
  for (const t of tiles.value) {
    byKey.set(`${t.x},${t.y},${t.z}`, t);
  }
  const rows: GridCell[][] = [];
  // North at top (same as map renderer: y decreases upward)
  for (let dy = r; dy >= -r; dy--) {
    const row: GridCell[] = [];
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const hit = byKey.get(`${x},${y},${cz}`);
      row.push({
        x,
        y,
        z: cz,
        glyph: hit?.glyph || ".",
        authored: hit?.authored === true,
        biome: hit?.biome,
        name: hit?.overlayName,
        isCenter: dx === 0 && dy === 0,
      });
    }
    rows.push(row);
  }
  return rows;
});

function coordLabel(
  c?: { x: number; y: number; z?: number; realm?: string } | null,
): string {
  if (!c) return "—";
  const z = c.z ?? 0;
  const base = z ? `${c.x}, ${c.y}, ${c.z}` : `${c.x}, ${c.y}`;
  return c.realm && c.realm !== "default"
    ? `${base} (${c.realm})`
    : base;
}

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return RADIUS_DEFAULT;
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Math.round(n)));
}

async function loadEntities(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const { res, data } = await api<{
      entities?: MapEntityRow[];
      error?: string;
    }>("/api/v1/map/entities");
    if (!res.ok) {
      loadError.value = data?.error ||
        `Could not load vehicles (${res.status}).`;
      entities.value = [];
      return;
    }
    entities.value = data?.entities ?? [];
    if (
      selectedId.value &&
      !entities.value.some((e) => e.id === selectedId.value)
    ) {
      selectedId.value = "";
    }
  } catch (e: unknown) {
    loadError.value = e instanceof Error
      ? e.message
      : "Could not load vehicles.";
    entities.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadLook(): Promise<void> {
  lookBusy.value = true;
  lookError.value = "";
  lookRadius.value = clampRadius(lookRadius.value);
  try {
    const r = lookRadius.value;
    const q =
      `center=${lookX.value},${lookY.value},${lookZ.value}` +
      `&radius=${r}`;
    const path =
      `/api/v1/map/realm/${encodeURIComponent(lookRealm.value || "default")}` +
      `/render?${q}`;
    const { res, data } = await api<{
      tiles?: RenderTile[];
      error?: string;
    }>(path);
    if (!res.ok) {
      lookError.value = data?.error ||
        `Could not load sector (${res.status}).`;
      tiles.value = [];
      return;
    }
    tiles.value = data?.tiles ?? [];
  } catch (e: unknown) {
    lookError.value = e instanceof Error
      ? e.message
      : "Could not load sector.";
    tiles.value = [];
  } finally {
    lookBusy.value = false;
  }
}

function applyPick(x: number, y: number, z: number): void {
  pickX.value = x;
  pickY.value = y;
  pickZ.value = z;
  markX.value = x;
  markY.value = y;
  markZ.value = z;
}

function selectTile(cell: GridCell): void {
  applyPick(cell.x, cell.y, cell.z);
  if (cell.name) {
    markName.value = cell.name;
  }
  if (cell.authored && cell.glyph) {
    markGlyph.value = cell.glyph;
  }
}

function selectTileAndCenter(cell: GridCell): void {
  selectTile(cell);
  recenterOnPick();
}

function selectEntity(e: MapEntityRow): void {
  selectedId.value = e.id;
  if (!e.coord) return;
  lookX.value = e.coord.x;
  lookY.value = e.coord.y;
  lookZ.value = e.coord.z ?? 0;
  if (e.coord.realm) lookRealm.value = e.coord.realm;
  lookLabel.value = `${e.name || e.id} @ ${coordLabel(e.coord)}`;
  applyPick(e.coord.x, e.coord.y, e.coord.z ?? 0);
  void loadLook();
}

function recenterOnPick(): void {
  lookX.value = pickX.value;
  lookY.value = pickY.value;
  lookZ.value = pickZ.value;
  lookLabel.value = `Centered on ${pickLabel.value}`;
  void loadLook();
}

function bumpRadius(delta: number): void {
  lookRadius.value = clampRadius(lookRadius.value + delta);
}

watch(lookRadius, () => {
  void loadLook();
});

function clampBand(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Math.round(v * 1000) / 1000;
}

function normalizeBiomeRow(b: Partial<LegendBiome>): LegendBiome {
  return {
    id: String(b.id ?? "biome").trim().toLowerCase() || "biome",
    name: String(b.name ?? "").trim() || "Biome",
    glyph: clampGlyph(String(b.glyph ?? ".")),
    color: b.color,
    traversal: b.traversal || "easy",
    elevMin: clampBand(b.elevMin, 0),
    elevMax: clampBand(b.elevMax, 1),
    moistMin: clampBand(b.moistMin, 0),
    moistMax: clampBand(b.moistMax, 1),
  };
}

async function loadLegend(): Promise<void> {
  legendBusy.value = true;
  legendMsg.value = "";
  try {
    const realm = encodeURIComponent(lookRealm.value || "default");
    const { res, data } = await api<{
      theme?: string;
      biomes?: Partial<LegendBiome>[];
      legend?: LegendBuckets;
      hasOverrides?: boolean;
      error?: string;
    }>(`/api/v1/map/legend?realm=${realm}`);
    if (!res.ok) {
      legendMsg.value = data?.error ||
        `Could not load legend (${res.status}).`;
      return;
    }
    legendTheme.value = data?.theme || "default";
    legendBiomes.value = (data?.biomes ?? []).map((b) =>
      normalizeBiomeRow(b)
    );
    legendFog.value = data?.legend?.fog || "?";
    legendFogMem.value = data?.legend?.fogMemory || ".";
    legendHasOverrides.value = data?.hasOverrides === true;
    legendDirty.value = false;
  } catch (e: unknown) {
    legendMsg.value = e instanceof Error
      ? e.message
      : "Could not load legend.";
  } finally {
    legendBusy.value = false;
  }
}

function touchLegend(): void {
  legendDirty.value = true;
  legendMsg.value = "";
}

function clampGlyph(raw: string): string {
  const s = String(raw ?? "");
  return s.length ? s.slice(0, 1) : ".";
}

function slugifyName(name: string): string {
  let s = name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  if (!s || !/^[a-z]/.test(s)) s = `biome_${s || "x"}`;
  return s;
}

function uniqueBiomeId(base: string): string {
  const taken = new Set(legendBiomes.value.map((b) => b.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const c = `${base}_${n}`;
    if (!taken.has(c)) return c;
  }
  return `biome_${Date.now().toString(36)}`;
}

function addBiome(): void {
  const n = legendBiomes.value.length;
  const name = `Biome ${n + 1}`;
  const id = uniqueBiomeId(slugifyName(name));
  // Default band sits mid-range; staff can tune Perlin coverage.
  const step = 0.12;
  const lo = Math.min(0.88, n * step);
  legendBiomes.value.push({
    id,
    name,
    glyph: String.fromCharCode(97 + (n % 26)),
    traversal: "easy",
    elevMin: lo,
    elevMax: Math.min(1, lo + step),
    moistMin: 0,
    moistMax: 1,
  });
  touchLegend();
}

function removeBiome(idx: number): void {
  if (legendBiomes.value.length <= 1) {
    legendMsg.value = "Keep at least one biome.";
    return;
  }
  legendBiomes.value.splice(idx, 1);
  touchLegend();
}

async function saveLegend(): Promise<void> {
  legendBusy.value = true;
  legendMsg.value = "";
  actionError.value = "";
  try {
    const body = {
      realm: lookRealm.value || "default",
      replace: true,
      biomes: legendBiomes.value.map((b) => ({
        id: String(b.id || "").trim().toLowerCase(),
        glyph: clampGlyph(b.glyph),
        name: b.name.trim() || b.id,
        traversal: b.traversal || "easy",
        elevMin: clampBand(b.elevMin, 0),
        elevMax: clampBand(b.elevMax, 1),
        moistMin: clampBand(b.moistMin, 0),
        moistMax: clampBand(b.moistMax, 1),
      })),
      legend: {
        fog: clampGlyph(legendFog.value),
        fogMemory: clampGlyph(legendFogMem.value),
      },
    };
    const { res, data } = await api<{
      hasOverrides?: boolean;
      error?: string;
    }>("/api/v1/map/legend", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      actionError.value = data?.error ||
        `Could not save legend (${res.status}).`;
      return;
    }
    legendMsg.value = "Legend saved — sector refreshed.";
    legendHasOverrides.value = data?.hasOverrides === true;
    legendDirty.value = false;
    await loadLegend();
    await loadLook();
  } catch (e: unknown) {
    actionError.value = e instanceof Error
      ? e.message
      : "Could not save legend.";
  } finally {
    legendBusy.value = false;
  }
}

async function resetLegend(): Promise<void> {
  legendBusy.value = true;
  legendMsg.value = "";
  actionError.value = "";
  try {
    const realm = encodeURIComponent(lookRealm.value || "default");
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/map/legend?realm=${realm}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      actionError.value = data?.error ||
        `Could not reset legend (${res.status}).`;
      return;
    }
    legendMsg.value = "Legend restored to theme defaults.";
    await loadLegend();
    await loadLook();
  } catch (e: unknown) {
    actionError.value = e instanceof Error
      ? e.message
      : "Could not reset legend.";
  } finally {
    legendBusy.value = false;
  }
}

async function runPrune(): Promise<void> {
  pruneBusy.value = true;
  pruneMsg.value = "";
  actionError.value = "";
  try {
    const { res, data } = await api<{
      pruned?: number;
      error?: string;
    }>("/api/v1/map/prune", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      actionError.value = data?.error ||
        `Cleanup failed (${res.status}).`;
      return;
    }
    const n = data?.pruned ?? 0;
    pruneMsg.value = n === 0
      ? "Nothing to clean up."
      : `Removed ${n} orphan record${n === 1 ? "" : "s"}.`;
    await loadEntities();
  } catch (e: unknown) {
    actionError.value = e instanceof Error
      ? e.message
      : "Cleanup failed.";
  } finally {
    pruneBusy.value = false;
  }
}

function markCoord(): { x: number; y: number; z: number } {
  const x = Math.round(Number(markX.value));
  const y = Math.round(Number(markY.value));
  const z = Math.round(Number(markZ.value));
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}

async function placeMark(): Promise<void> {
  markBusy.value = true;
  markMsg.value = "";
  actionError.value = "";
  const glyph = clampGlyph(String(markGlyph.value || "#"));
  const name = markName.value.trim() || "Mark";
  const { x, y, z } = markCoord();
  markX.value = x;
  markY.value = y;
  markZ.value = z;
  try {
    const { res, data } = await api<{ error?: string }>(
      "/api/v1/map/overlay",
      {
        method: "POST",
        body: JSON.stringify({
          x,
          y,
          z,
          realm: lookRealm.value || "default",
          kind: "mark",
          glyph,
          name,
        }),
      },
    );
    if (!res.ok) {
      actionError.value = data?.error ||
        `Could not place mark (${res.status}).`;
      return;
    }
    markMsg.value = `Placed “${name}” at ${x}, ${y}.`;
    applyPick(x, y, z);
    await loadLook();
  } catch (e: unknown) {
    actionError.value = e instanceof Error
      ? e.message
      : "Could not place mark.";
  } finally {
    markBusy.value = false;
  }
}

async function clearMark(): Promise<void> {
  markBusy.value = true;
  markMsg.value = "";
  actionError.value = "";
  const { x, y, z } = markCoord();
  markX.value = x;
  markY.value = y;
  markZ.value = z;
  try {
    const realm = encodeURIComponent(lookRealm.value || "default");
    const q = `x=${x}&y=${y}&z=${z}&realm=${realm}`;
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/map/overlay?${q}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 204) {
      actionError.value = data?.error ||
        `Could not clear mark (${res.status}).`;
      return;
    }
    markMsg.value = `Cleared mark at ${x}, ${y}.`;
    await loadLook();
  } catch (e: unknown) {
    actionError.value = e instanceof Error
      ? e.message
      : "Could not clear mark.";
  } finally {
    markBusy.value = false;
  }
}

/** Scroll a section into the main pane (not the window). */
function scrollTo(id: string): void {
  const run = () => {
    const el = document.getElementById(id);
    if (!el) return;
    const pane = document.querySelector(
      ".main-pane",
    ) as HTMLElement | null;
    if (!pane) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const elRect = el.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const top = pane.scrollTop + (elRect.top - paneRect.top) - 10;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };
  void nextTick(() => {
    requestAnimationFrame(() => requestAnimationFrame(run));
  });
}

function toolSectionId(tool: unknown): string {
  const t = String(tool ?? "").toLowerCase();
  if (t === "look") return "map-look";
  if (t === "mark") return "map-mark";
  if (t === "cleanup") return "map-cleanup";
  if (t === "legend") return "map-legend";
  return "map-vehicles";
}

function isPicked(cell: GridCell): boolean {
  return cell.x === pickX.value &&
    cell.y === pickY.value &&
    cell.z === pickZ.value;
}

function cellTitle(cell: GridCell): string {
  const bits = [`${cell.x}, ${cell.y}`];
  if (cell.name) bits.push(cell.name);
  else if (cell.biome) bits.push(cell.biome);
  if (cell.authored) bits.push("marked");
  return bits.join(" · ");
}

watch(
  () => route.query.tool,
  (tool) => {
    scrollTo(toolSectionId(tool));
  },
);

onMounted(async () => {
  await Promise.all([loadEntities(), loadLegend()]);
  if (entities.value[0]) {
    selectEntity(entities.value[0]);
  } else {
    lookLabel.value = "Origin (0, 0)";
    applyPick(0, 0, 0);
    await loadLook();
  }
  // Jump after content is painted (side-nav ?tool=).
  scrollTo(toolSectionId(route.query.tool));
});
</script>

<template>
  <article
    id="main-map"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          World
        </p>
        <h1 class="page-title">
          {{ pluginMeta.title }}
        </h1>
        <p class="muted">
          {{ summaryLine }}
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="loading"
          @click="loadEntities"
        >
          Refresh
        </button>
      </div>
    </header>

    <p
      v-if="loadError || actionError"
      class="error"
      role="alert"
    >
      {{ loadError || actionError }}
    </p>
    <p
      v-if="pruneMsg || markMsg || legendMsg"
      class="muted"
    >
      {{ pruneMsg || markMsg || legendMsg }}
    </p>

    <!-- Vehicles on the grid -->
    <section
      id="map-vehicles"
      class="dash-section"
      aria-labelledby="map-vehicles-h"
    >
      <div class="dash-section-head">
        <h2
          id="map-vehicles-h"
          class="dash-h2"
        >
          On the map
          <span
            v-if="!loading"
            class="muted"
          >({{ entities.length }})</span>
        </h2>
      </div>
      <p class="muted map-help">
        Live vehicles. Select a row to center the sector grid below.
      </p>
      <p
        v-if="loading && !entities.length"
        class="muted"
      >
        Loading…
      </p>
      <p
        v-else-if="!entities.length"
        class="muted"
      >
        Nobody is on the map right now. Players
        <code>enter</code> a map-capable vehicle, then
        <code>+map/launch</code>.
      </p>
      <div
        v-else
        class="table-wrap"
      >
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                Vehicle
              </th>
              <th scope="col">
                Position
              </th>
              <th scope="col">
                Container
              </th>
              <th scope="col">
                Faction
              </th>
              <th scope="col">
                <span class="sr-only">Select</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in entities"
              :key="e.id"
              tabindex="0"
              :class="{ 'is-selected': e.id === selectedId }"
              @click="selectEntity(e)"
              @keydown.enter.prevent="selectEntity(e)"
            >
              <td>
                <span
                  class="map-glyph"
                  aria-hidden="true"
                >
                  {{ e.glyph || "@" }}
                </span>
                {{ e.name || e.id }}
                <span
                  v-if="e.hidden"
                  class="badge"
                >hidden</span>
              </td>
              <td class="muted">
                {{ coordLabel(e.coord) }}
              </td>
              <td class="muted">
                <code v-if="e.containerId">
                  #{{ e.containerId }}
                </code>
                <template v-else>
                  —
                </template>
              </td>
              <td class="muted">
                {{ e.factionId || "—" }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="selectEntity(e)"
                >
                  Look
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Sector grid -->
    <section
      id="map-look"
      class="dash-section"
      aria-labelledby="map-look-h"
    >
      <div class="dash-section-head">
        <h2
          id="map-look-h"
          class="dash-h2"
        >
          Sector grid
        </h2>
        <div class="map-look-tools">
          <button
            type="button"
            class="secondary outline"
            :disabled="lookBusy || lookRadius <= RADIUS_MIN"
            title="See less"
            @click="bumpRadius(-1)"
          >
            −
          </button>
          <label class="map-radius-label">
            <span class="sr-only">View radius</span>
            <input
              v-model.number="lookRadius"
              type="range"
              :min="RADIUS_MIN"
              :max="RADIUS_MAX"
              step="1"
            >
            <span class="muted map-radius-val">
              {{ lookRadius }}
              ({{ gridSize }}×{{ gridSize }})
            </span>
          </label>
          <button
            type="button"
            class="secondary outline"
            :disabled="lookBusy || lookRadius >= RADIUS_MAX"
            title="See more"
            @click="bumpRadius(1)"
          >
            +
          </button>
          <button
            type="button"
            class="secondary outline"
            :disabled="lookBusy"
            @click="loadLook"
          >
            {{ lookBusy ? "…" : "Refresh" }}
          </button>
        </div>
      </div>
      <p class="muted map-help">
        {{ lookLabel }}
        <template v-if="selected">
          · vehicle
          <strong>{{ selected.name || selected.id }}</strong>
        </template>
        · click a tile to set mark X/Y
        · selected tile
        <strong>{{ pickLabel }}</strong>
      </p>
      <p
        v-if="lookError"
        class="error"
        role="alert"
      >
        {{ lookError }}
      </p>

      <div
        v-if="sectorGrid.length"
        class="map-grid-wrap"
      >
        <div
          class="map-tile-grid"
          role="grid"
          :aria-label="`Sector ${gridSize} by ${gridSize}`"
          :style="{
            '--map-cols': String(gridSize),
          }"
        >
          <template
            v-for="(row, ri) in sectorGrid"
            :key="'r' + ri"
          >
            <button
              v-for="cell in row"
              :key="`${cell.x},${cell.y},${cell.z}`"
              type="button"
              class="map-tile"
              role="gridcell"
              :class="{
                'is-picked': isPicked(cell),
                'is-center': cell.isCenter,
                'is-authored': cell.authored,
              }"
              :title="cellTitle(cell)"
              :aria-label="cellTitle(cell)"
              :aria-pressed="isPicked(cell)"
              @click="selectTile(cell)"
              @dblclick="selectTileAndCenter(cell)"
            >
              {{ cell.glyph }}
            </button>
          </template>
        </div>
        <ul
          v-if="legendBiomes.length"
          class="map-legend-strip"
          aria-label="Biome legend"
        >
          <li
            v-for="b in legendBiomes"
            :key="b.id"
            class="map-legend-chip"
          >
            <span
              class="map-legend-g"
              aria-hidden="true"
            >{{ b.glyph }}</span>
            <span class="map-legend-n">{{ b.name }}</span>
          </li>
        </ul>
        <p class="muted map-grid-hint">
          Double-click a tile to re-center.
          <button
            type="button"
            class="secondary outline map-inline-btn"
            @click="recenterOnPick"
          >
            Center on {{ pickLabel }}
          </button>
        </p>
      </div>
      <p
        v-else-if="!lookBusy"
        class="muted"
      >
        No sector loaded yet.
      </p>
    </section>

    <!-- Legend editor — full Perlin biome pack -->
    <section
      id="map-legend"
      class="dash-section"
      aria-labelledby="map-legend-h"
    >
      <div class="dash-section-head">
        <h2
          id="map-legend-h"
          class="dash-h2"
        >
          Legend
          <span
            v-if="legendHasOverrides"
            class="badge"
          >custom</span>
        </h2>
        <div class="map-legend-actions">
          <button
            type="button"
            class="secondary outline"
            :disabled="legendBusy"
            @click="addBiome"
          >
            Add biome
          </button>
          <button
            type="button"
            class="secondary outline"
            :disabled="legendBusy || !legendHasOverrides"
            @click="resetLegend"
          >
            Reset theme
          </button>
          <button
            type="button"
            :disabled="legendBusy || !legendDirty"
            @click="saveLegend"
          >
            {{ legendBusy ? "Saving…" : "Save legend" }}
          </button>
        </div>
      </div>
      <p class="muted map-help">
        Biomes drive the Perlin map. Each row is a glyph + name and
        an elevation / moisture band (0–1). First match wins.
        Theme: <strong>{{ legendTheme }}</strong>.
      </p>
      <ul
        v-if="legendBiomes.length"
        class="map-biome-list"
        aria-label="Biome pack"
      >
        <li
          v-for="(b, bi) in legendBiomes"
          :key="'biome-' + bi"
          class="map-biome-card"
        >
          <div class="map-biome-top">
            <label class="map-biome-glyph-lab">
              <span class="sr-only">Glyph</span>
              <input
                v-model="b.glyph"
                class="map-glyph-input"
                type="text"
                maxlength="1"
                :aria-label="`Glyph for ${b.name}`"
                @input="touchLegend"
              >
            </label>
            <label class="map-biome-name-lab">
              <span class="map-field-lab">Name</span>
              <input
                v-model="b.name"
                class="map-name-input"
                type="text"
                maxlength="80"
                :aria-label="`Name for row ${bi + 1}`"
                @input="touchLegend"
              >
            </label>
            <button
              type="button"
              class="secondary outline map-biome-del"
              :disabled="legendBiomes.length <= 1"
              :aria-label="`Remove ${b.name}`"
              @click="removeBiome(bi)"
            >
              Del
            </button>
          </div>
          <div class="map-biome-mid">
            <label>
              <span class="map-field-lab">Id</span>
              <input
                v-model="b.id"
                class="map-id-input"
                type="text"
                maxlength="32"
                spellcheck="false"
                :aria-label="`Id for ${b.name}`"
                @input="touchLegend"
              >
            </label>
            <label>
              <span class="map-field-lab">Travel</span>
              <select
                v-model="b.traversal"
                class="map-travel-select"
                :aria-label="`Travel for ${b.name}`"
                @change="touchLegend"
              >
                <option
                  v-for="t in TRAVEL_OPTS"
                  :key="t"
                  :value="t"
                >
                  {{ t }}
                </option>
              </select>
            </label>
          </div>
          <div class="map-biome-bands">
            <label class="map-band-group">
              <span class="map-field-lab">Elev 0–1</span>
              <span class="map-band-pair">
                <input
                  v-model.number="b.elevMin"
                  class="map-band-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Elev min"
                  @input="touchLegend"
                >
                <span class="muted" aria-hidden="true">–</span>
                <input
                  v-model.number="b.elevMax"
                  class="map-band-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Elev max"
                  @input="touchLegend"
                >
              </span>
            </label>
            <label class="map-band-group">
              <span class="map-field-lab">Moist 0–1</span>
              <span class="map-band-pair">
                <input
                  v-model.number="b.moistMin"
                  class="map-band-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Moist min"
                  @input="touchLegend"
                >
                <span class="muted" aria-hidden="true">–</span>
                <input
                  v-model.number="b.moistMax"
                  class="map-band-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Moist max"
                  @input="touchLegend"
                >
              </span>
            </label>
          </div>
        </li>
      </ul>
      <p
        v-else-if="!legendBusy"
        class="muted"
      >
        No biomes loaded.
      </p>
      <div class="map-fog-row">
        <label>
          Fog
          <input
            v-model="legendFog"
            class="map-glyph-input"
            type="text"
            maxlength="1"
            @input="touchLegend"
          >
        </label>
        <label>
          Memory
          <input
            v-model="legendFogMem"
            class="map-glyph-input"
            type="text"
            maxlength="1"
            @input="touchLegend"
          >
        </label>
      </div>
    </section>

    <!-- Mark tile -->
    <section
      id="map-mark"
      class="dash-section"
      aria-labelledby="map-mark-h"
    >
      <div class="dash-section-head">
        <h2
          id="map-mark-h"
          class="dash-h2"
        >
          Mark a tile
        </h2>
      </div>
      <p class="muted map-help">
        Click a sector tile to fill X/Y, then place or clear.
      </p>
      <p class="muted map-help">
        Selected tile
        <strong>{{ pickLabel }}</strong>
        · realm <code>{{ lookRealm || "default" }}</code>
      </p>
      <div class="map-mark-form">
        <label>
          X
          <input
            v-model.number="markX"
            class="map-coord-input"
            type="number"
            step="1"
          >
        </label>
        <label>
          Y
          <input
            v-model.number="markY"
            class="map-coord-input"
            type="number"
            step="1"
          >
        </label>
        <label>
          Z
          <input
            v-model.number="markZ"
            class="map-coord-input"
            type="number"
            step="1"
          >
        </label>
        <label>
          Glyph
          <input
            v-model="markGlyph"
            class="map-glyph-input"
            type="text"
            maxlength="1"
            aria-label="One character"
          >
        </label>
        <label class="map-mark-name">
          Name
          <input
            v-model="markName"
            class="map-name-input"
            type="text"
            maxlength="80"
            placeholder="Bunker"
          >
        </label>
        <div class="map-mark-actions">
          <button
            type="button"
            :disabled="markBusy"
            @click="placeMark"
          >
            {{ markBusy ? "…" : "Place" }}
          </button>
          <button
            type="button"
            class="secondary outline"
            :disabled="markBusy"
            @click="clearMark"
          >
            Clear tile
          </button>
        </div>
      </div>
    </section>

    <!-- Cleanup — compact footer ops -->
    <section
      id="map-cleanup"
      class="dash-section map-cleanup"
      aria-labelledby="map-cleanup-h"
    >
      <div class="map-cleanup-row">
        <div>
          <h2
            id="map-cleanup-h"
            class="dash-h2"
          >
            Cleanup
          </h2>
          <p class="muted map-cleanup-lede">
            Drop orphan entities · reclaim stranded vehicles
          </p>
        </div>
        <button
          type="button"
          class="secondary outline"
          :disabled="pruneBusy"
          @click="runPrune"
        >
          {{ pruneBusy ? "Working…" : "Run cleanup" }}
        </button>
      </div>
      <p
        v-if="pruneMsg"
        class="muted map-cleanup-status"
      >
        {{ pruneMsg }}
      </p>
    </section>
  </article>
</template>

<style scoped>
.map-help {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  max-width: 48rem;
}

.map-glyph {
  display: inline-block;
  min-width: 1.25rem;
  margin-inline-end: 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: var(--primary);
}

#main-map .dash-table tbody tr.is-selected td {
  background: rgba(139, 92, 246, 0.12);
}

#main-map .dash-table tbody tr {
  cursor: pointer;
}

.map-look-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.map-look-tools > button {
  width: auto;
  min-width: 2.25rem;
  min-height: 2.25rem;
  margin: 0;
  padding: 0.25rem 0.55rem;
}

.map-radius-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.75rem;
}

.map-radius-label input[type="range"] {
  width: 8rem;
  margin: 0;
  padding: 0;
  min-height: 0;
}

.map-radius-val {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 5.5rem;
}

.map-grid-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-width: 100%;
  overflow: auto;
}

.map-tile-grid {
  display: grid;
  grid-template-columns: repeat(
    var(--map-cols, 11),
    minmax(1.2rem, 1.55rem)
  );
  gap: 0;
  width: max-content;
  padding: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
  border-radius: 0;
  background: var(--bg-code, var(--bg-surface));
}

/* Beat global button chrome (radius / solid border / min-height). */
.map-tile {
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 1;
  min-width: 1.2rem;
  min-height: 0 !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 1px solid
    color-mix(in srgb, var(--border) 28%, transparent) !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--text) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem !important;
  font-weight: 600 !important;
  line-height: 1;
  letter-spacing: 0 !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  box-shadow: none !important;
}

.map-tile:hover,
.map-tile:focus-visible {
  background: rgba(139, 92, 246, 0.14) !important;
  border-color: color-mix(
    in srgb,
    var(--primary) 40%,
    transparent
  ) !important;
  outline: none !important;
  box-shadow: none !important;
}

.map-tile.is-center:not(.is-picked) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.map-tile.is-authored {
  color: var(--primary-hover, var(--primary)) !important;
}

.map-tile.is-picked {
  background: rgba(139, 92, 246, 0.28) !important;
  color: var(--text) !important;
  border-color: color-mix(
    in srgb,
    var(--primary) 55%,
    transparent
  ) !important;
  border-radius: 0 !important;
}

.map-grid-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin: 0;
  font-size: 0.8125rem;
}

.map-inline-btn {
  width: auto !important;
  min-height: 2rem !important;
  margin: 0 !important;
  padding: 0.2rem 0.55rem !important;
  font-size: 0.75rem !important;
}

.map-mark-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 0.85rem;
  align-items: flex-end;
  width: 100%;
  max-width: 40rem;
}

.map-mark-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0 !important;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

.map-mark-form .map-coord-input {
  width: 5.5rem !important;
  min-width: 5.5rem;
  min-height: 2.35rem !important;
  margin: 0 !important;
  padding: 0.35rem 0.45rem !important;
}

.map-mark-form .map-glyph-input {
  width: 2.75rem !important;
  min-height: 2.35rem !important;
  margin: 0 !important;
}

.map-mark-form .map-mark-name {
  flex: 1 1 12rem;
  min-width: 10rem;
}

.map-mark-form .map-mark-name .map-name-input {
  width: 100% !important;
  min-height: 2.35rem !important;
  margin: 0 !important;
}

.map-mark-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.map-mark-actions button {
  width: auto !important;
  margin: 0 !important;
  min-height: 2.35rem !important;
  flex: 0 0 auto;
}

/* Side-nav jump targets clear the sticky chrome. */
#map-vehicles,
#map-look,
#map-legend,
#map-mark,
#map-cleanup {
  scroll-margin-top: 0.75rem;
}

.map-legend-strip {
  list-style: none !important;
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.45rem;
  margin: 0.55rem 0 0 !important;
  padding: 0 !important;
  max-width: 100%;
  font-size: 0.75rem;
}

.map-legend-strip > .map-legend-chip {
  display: inline-flex !important;
  align-items: center;
  gap: 0.35rem;
  margin: 0 !important;
  padding: 0.2rem 0.45rem 0.2rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-muted);
  line-height: 1.2;
  white-space: nowrap;
}

.map-legend-strip .map-legend-g {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0;
  border-radius: 2px;
  background: var(--bg-code, var(--bg-elevated));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 0.8125rem;
  color: var(--text);
}

.map-legend-strip .map-legend-n {
  color: var(--text-secondary);
  font-weight: 500;
}

.map-legend-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.map-legend-actions button {
  width: auto !important;
  margin: 0 !important;
  min-height: 2.25rem !important;
  flex: 0 1 auto;
}

/* Card pack — works on mobile (no wide table). */
.map-biome-list {
  list-style: none !important;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 0 0 0.85rem !important;
  padding: 0 !important;
  width: 100%;
  max-width: 40rem;
}

.map-biome-card {
  margin: 0 !important;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.map-biome-top,
.map-biome-mid,
.map-biome-bands {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem 0.65rem;
}

.map-biome-card label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0 !important;
  min-width: 0;
}

.map-field-lab {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.map-biome-glyph-lab {
  flex: 0 0 auto;
}

.map-biome-name-lab {
  flex: 1 1 10rem;
  min-width: 8rem;
}

.map-biome-del {
  width: auto !important;
  min-height: 2.35rem !important;
  margin: 0 0 0 auto !important;
  padding: 0.3rem 0.65rem !important;
  flex: 0 0 auto;
}

.map-biome-mid > label {
  flex: 1 1 8rem;
  min-width: 7rem;
}

.map-band-group {
  flex: 1 1 9rem;
  min-width: 8rem;
}

.map-band-pair {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.map-biome-card .map-glyph-input,
.map-fog-row .map-glyph-input {
  width: 2.75rem !important;
  min-width: 2.75rem;
  min-height: 2.35rem !important;
  margin: 0 !important;
  padding: 0.25rem !important;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 1rem !important;
}

.map-biome-card .map-name-input,
.map-biome-card .map-id-input,
.map-biome-card .map-travel-select {
  width: 100% !important;
  min-height: 2.35rem !important;
  margin: 0 !important;
  box-sizing: border-box;
}

.map-biome-card .map-id-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem !important;
}

.map-biome-card .map-travel-select {
  font-size: 0.8125rem !important;
}

.map-biome-card .map-band-input {
  width: 4rem !important;
  min-width: 3.5rem;
  min-height: 2.35rem !important;
  margin: 0 !important;
  padding: 0.25rem 0.35rem !important;
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem !important;
  text-align: center;
  box-sizing: border-box;
}

@media (max-width: 640px) {
  #map-legend .dash-section-head {
    flex-direction: column;
    align-items: stretch;
    gap: 0.65rem;
  }

  .map-legend-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem;
  }

  .map-legend-actions button:last-child {
    grid-column: 1 / -1;
  }

  .map-legend-actions button {
    width: 100% !important;
    min-width: 0 !important;
  }

  .map-biome-top {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: end;
    gap: 0.45rem;
  }

  .map-biome-name-lab {
    min-width: 0;
  }

  .map-biome-del {
    margin: 0 !important;
  }

  .map-biome-mid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .map-biome-mid > label {
    min-width: 0;
  }

  .map-biome-bands {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .map-band-group {
    min-width: 0;
  }

  .map-band-pair {
    width: 100%;
  }

  .map-biome-card .map-band-input {
    flex: 1 1 0;
    width: 0 !important;
    min-width: 0;
  }

  .map-mark-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    max-width: none;
  }

  .map-mark-form .map-coord-input {
    width: 100% !important;
    min-width: 0;
  }

  .map-mark-form .map-glyph-input {
    width: 100% !important;
  }

  .map-mark-form .map-mark-name {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .map-mark-actions {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem;
  }

  .map-mark-actions button {
    width: 100% !important;
  }

  .map-cleanup-row {
    flex-direction: column;
    align-items: stretch;
  }

  .map-cleanup-row > button {
    width: 100% !important;
  }
}

.map-fog-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-top: 0.85rem;
  align-items: flex-end;
}

.map-fog-row label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

.map-cleanup-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.map-cleanup-row .dash-h2 {
  margin: 0 0 0.15rem;
}

.map-cleanup-lede {
  margin: 0;
  font-size: 0.8125rem;
}

.map-cleanup-row > button {
  width: auto;
  margin: 0;
  min-height: 2.25rem;
  flex-shrink: 0;
}

.map-cleanup-status {
  margin: 0.55rem 0 0;
  font-size: 0.8125rem;
}

@media (max-width: 640px) {
  .map-cleanup-row {
    flex-direction: column;
    align-items: stretch;
  }

  .map-cleanup-row > button {
    width: 100%;
  }

  .map-legend-actions {
    width: 100%;
  }

  .map-legend-actions button {
    flex: 1 1 auto;
  }
}
</style>
