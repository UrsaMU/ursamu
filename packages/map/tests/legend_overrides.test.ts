import { assertEquals } from "@std/assert";
import {
  applyOverrideToConfig,
  legendDTO,
  parseLegendBody,
  resetLegendOverrides,
  saveLegendOverrides,
  suggestBiomeId,
} from "../legend-overrides.ts";
import {
  _clearMapConfigs,
  getMapConfig,
  registerMapConfig,
} from "../mapconfig.ts";
import { defaultMapConfig } from "../config.default.ts";
import { hedgeMapConfig } from "../config/hedge.ts";
import { buildRenderResponse, handleLegendRoute } from "../routes.ts";
import { DBO } from "ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("legend: parse rejects bad glyph", OPTS, () => {
  const r = parseLegendBody({
    biomes: [{ id: "plains", glyph: "xx" }],
  });
  assertEquals("error" in r, true);
});

Deno.test("legend: parse accepts full pack row", OPTS, () => {
  const r = parseLegendBody({
    biomes: [{
      id: "mire",
      name: "Black Mire",
      glyph: ",",
      traversal: "rough",
      elevMin: 0,
      elevMax: 0.4,
      moistMin: 0.5,
      moistMax: 1,
    }],
  });
  assertEquals("error" in r, false);
});

Deno.test("legend: applyOverrideToConfig full pack", OPTS, () => {
  const next = applyOverrideToConfig(defaultMapConfig, {
    biomeList: [{
      id: "only",
      name: "Only",
      glyph: "X",
      phrases: { self: ["x"] },
      traversal: "easy",
    }],
    matrix: [{
      elevation: [0, 1],
      moisture: [0, 1],
      biome: "only",
    }],
  });
  assertEquals(next.biomes.length, 1);
  assertEquals(next.biomes[0]!.glyph, "X");
  assertEquals(next.matrix[0]!.biome, "only");
});

Deno.test("legend: apply legacy glyph patch", OPTS, () => {
  const next = applyOverrideToConfig(defaultMapConfig, {
    biomes: { plains: { glyph: "P" } },
  });
  assertEquals(
    next.biomes.find((b) => b.id === "plains")?.glyph,
    "P",
  );
});

Deno.test("legend: save pack add/delete/rename + reset", OPTS, async () => {
  _clearMapConfigs();
  registerMapConfig("default", hedgeMapConfig);
  try {
    const pack = hedgeMapConfig.biomes.map((b, i) => {
      const cell = hedgeMapConfig.matrix.find((c) =>
        c.biome === b.id
      );
      return {
        id: b.id === "briar" ? "thorns" : b.id,
        name: b.id === "briar" ? "Thorn Wall" : b.name,
        glyph: b.id === "briar" ? "B" : b.glyph,
        traversal: b.traversal ?? "easy",
        elevMin: cell?.elevation[0] ?? 0,
        elevMax: cell?.elevation[1] ?? 1,
        moistMin: cell?.moisture[0] ?? 0,
        moistMax: cell?.moisture[1] ?? 1,
      };
    }).filter((b) => b.id !== "glade");
    // dropped glade; renamed briar → thorns
    pack.push({
      id: "ash",
      name: "Ash Field",
      glyph: "a",
      traversal: "rough",
      elevMin: 0.1,
      elevMax: 0.2,
      moistMin: 0.1,
      moistMax: 0.2,
    });

    const saved = await saveLegendOverrides({
      realm: "default",
      replace: true,
      biomes: pack,
      legend: { fog: "X", fogMemory: "m" },
    });
    assertEquals(saved.hasOverrides, true);
    assertEquals(
      saved.biomes.some((b) => b.id === "glade"),
      false,
    );
    assertEquals(
      saved.biomes.find((b) => b.id === "thorns")?.glyph,
      "B",
    );
    assertEquals(
      saved.biomes.find((b) => b.id === "ash")?.name,
      "Ash Field",
    );
    assertEquals(saved.legend.fog, "X");

    const cfg = getMapConfig("default");
    assertEquals(cfg.matrix.some((c) => c.biome === "thorns"), true);
    assertEquals(cfg.matrix.some((c) => c.biome === "ash"), true);

    const reset = await resetLegendOverrides("default");
    assertEquals(reset.hasOverrides, false);
    assertEquals(
      reset.biomes.find((b) => b.id === "briar")?.glyph,
      "T",
    );
  } finally {
    await resetLegendOverrides("default");
    _clearMapConfigs();
    await DBO.close();
  }
});

Deno.test("legend: render uses pack glyph", OPTS, async () => {
  _clearMapConfigs();
  registerMapConfig("default", defaultMapConfig);
  try {
    await saveLegendOverrides({
      realm: "default",
      replace: true,
      biomes: defaultMapConfig.biomes.map((b) => {
        const cell = defaultMapConfig.matrix.find((c) =>
          c.biome === b.id
        );
        return {
          id: b.id,
          name: b.name,
          glyph: b.id === "mudflats" ? "M" : b.glyph,
          traversal: b.traversal ?? "easy",
          elevMin: cell?.elevation[0] ?? 0,
          elevMax: cell?.elevation[1] ?? 1,
          moistMin: cell?.moisture[0] ?? 0,
          moistMax: cell?.moisture[1] ?? 1,
        };
      }),
    });
    const dto = await buildRenderResponse(
      "default",
      { x: 0, y: 0, z: 0 },
      0,
    );
    assertEquals(dto.tiles.length, 1);
    const g = getMapConfig("default").biomes.find(
      (b) => b.id === dto.tiles[0]!.biome,
    )?.glyph;
    assertEquals(dto.tiles[0]!.glyph, g);
    const mud = legendDTO("default").biomes.find(
      (b) => b.id === "mudflats",
    );
    assertEquals(mud?.glyph, "M");
  } finally {
    await resetLegendOverrides("default");
    _clearMapConfigs();
    await DBO.close();
  }
});

Deno.test("legend: suggestBiomeId unique", OPTS, () => {
  const taken = new Set(["mire", "mire_2"]);
  assertEquals(suggestBiomeId("Mire", taken), "mire_3");
});

Deno.test("legend route: 401 when userId null", OPTS, async () => {
  const res = await handleLegendRoute(
    new Request("https://x/api/v1/map/legend"),
    null,
  );
  assertEquals(res.status, 401);
});
