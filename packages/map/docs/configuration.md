# `@ursamu/map-plugin` — Configuration Reference

Reference for authoring a custom `MapConfig`. Every type below mirrors
`schemas.ts` exactly — that file is the contract.

Contents: [At a glance](#at-a-glance) · [`MapConfig`](#mapconfig-reference) · [`MapNoiseConfig`](#mapnoiseconfig) · [`BiomeDefinition`](#biomedefinition) · [`WhittakerCell`](#whittakercell-and-the-matrix) · [`MapLegend`](#maplegend) · [Worked example](#worked-example-a-swamp-world) · [Loading a custom config](#loading-a-custom-config)

## At a glance

```typescript
import type { MapConfig } from "@ursamu/map-plugin/schemas.ts";

const config: MapConfig = {
  noise: {
    elevation: { seed: "elev-v1", scale: 24, octaves: [{ frequency: 1, amplitude: 1 }] },
    moisture:  { seed: "moist-v1", scale: 24, octaves: [{ frequency: 1, amplitude: 1 }] },
  },
  biomes: [/* BiomeDefinition[] */],
  legend: { terrain: [], infrastructure: [], entities: [] },
  matrix: [/* WhittakerCell[] */],
};
```

> The full schema is defined in `schemas.ts`. The default config in
> `config.default.ts` is a working reference implementation — copy from it
> liberally.

## `MapConfig` reference

| Field             | Type                                                    | Required | Default | Description                                                            |
| ----------------- | ------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------- |
| `noise.elevation` | `MapNoiseConfig`                                        | yes      | —       | Noise field driving the elevation axis (0..1 after normalization).     |
| `noise.moisture`  | `MapNoiseConfig`                                        | yes      | —       | Noise field driving the moisture axis (0..1 after normalization).      |
| `biomes`          | `BiomeDefinition[]`                                     | yes      | —       | All biomes referenced by `matrix[].biome`. `biomes[0]` is the fallback. |
| `legend`          | `MapLegend`                                             | yes      | —       | Glyph categories for the rendered minimap.                             |
| `matrix`          | `WhittakerCell[]`                                       | yes      | —       | Lookup table mapping (elevation, moisture) → biome id.                 |
| `viewportWidth`   | `number` (odd)                                          | no       | `15`    | Minimap width in cells. Must be odd so the centre is well-defined.     |
| `viewportHeight`  | `number` (odd)                                          | no       | `7`     | Minimap height in cells. Must be odd.                                  |
| `sectors`         | `Record<string, { name: string; aabb: [Coord, Coord] }>` | no       | —       | Named axis-aligned regions used to label the renderer header.          |

## `MapNoiseConfig`

| Field     | Type                                       | Required | Description                                                  |
| --------- | ------------------------------------------ | -------- | ------------------------------------------------------------ |
| `seed`    | `string`                                   | yes      | Deterministic seed — **same string always produces the same world**. |
| `scale`   | `number`                                   | yes      | World-space distance covered by one base-octave unit. Higher = larger features. |
| `octaves` | `{ frequency: number; amplitude: number }[]` | yes      | Octave weights. Amplitudes are summed and normalized internally. |

```typescript
// 1-octave: smooth, continent-scale
const smooth: MapNoiseConfig = {
  seed: "elev-smooth", scale: 48,
  octaves: [{ frequency: 1, amplitude: 1 }],
};

// 3-octave default: broad shape plus fine detail
const detailed: MapNoiseConfig = {
  seed: "ursamu-elevation-v1", scale: 24,
  octaves: [
    { frequency: 1, amplitude: 1    },
    { frequency: 2, amplitude: 0.5  },
    { frequency: 4, amplitude: 0.25 },
  ],
};
```

## `BiomeDefinition`

| Field               | Type                                                                | Required | Description                                                        |
| ------------------- | ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `id`                | `string`                                                            | yes      | Stable identifier referenced by `matrix[].biome` and overlays.     |
| `name`              | `string`                                                            | yes      | Display label, e.g. `"Mudflats"`.                                  |
| `glyph`             | `Glyph` (single Latin-1 char)                                       | yes      | The minimap glyph.                                                 |
| `color`             | `string`                                                            | no       | MUSH color code applied to the glyph, e.g. `"%cg"`.                |
| `phrases.self`      | `string[]`                                                          | yes      | Used when this biome dominates the centre tile.                    |
| `phrases.adjacent`  | `string[]`                                                          | no       | Used when this biome appears in a cardinal neighbour tile.         |
| `traversal`         | `"trivial" \| "easy" \| "rough" \| "hazard" \| "impassable"`        | no       | Hint for movement / vehicle rules.                                 |

**Phrasing rule:** briefings are objective. Describe the terrain, not the
observer. No "you see", no "you find yourself", no second person.

```typescript
// good
"cracked mudflats stretch in every direction"
"ankle-deep water laps over a silt bed"

// bad
"you see a wide stretch of cracked mud"
// corrected:
"a wide stretch of cracked mud spans the basin"
```

## `WhittakerCell` and the matrix

Both axes are normalized to `0..1` after octave summation. A cell matches when
both the elevation sample and the moisture sample fall inside its half-open
ranges. **Lookup is first-match-wins by array order.** Cells SHOULD tile the
unit square without gaps; if a sample falls in a gap, the engine falls back to
`biomes[0]`.

```typescript
export interface WhittakerCell {
  elevation: [number, number];
  moisture: [number, number];
  biome: string; // BiomeDefinition.id
}
```

The default config tiles the space like this:

```
                       moisture →
              0.00      0.30      0.60      1.00
            +---------+---------+---------+
elev = 1.00 |               ridge               |    (covers all moisture)
            +---------+---------+---------+
elev = 0.70 |  road   | plains  |  brush  |
            +---------+---------+---------+
elev = 0.45 | mudflats| shallows|  brush  |
            +---------+---------+---------+
elev = 0.30 | mudflats| shallows| deep_water |
            +---------+---------+---------+
elev = 0.00
```

Note the deliberate vertical overlap (mudflats `0..0.45`, road `0.30..0.55`,
plains `0.30..0.65`): earlier rows win, so the order in `matrix` is meaningful.

## `MapLegend`

Three glyph buckets, all Latin-1:

| Bucket           | Style                | Examples         |
| ---------------- | -------------------- | ---------------- |
| `terrain`        | light punctuation    | `.` `,` `~` `^`  |
| `infrastructure` | heavy symbols        | `#` `=` `+`      |
| `entities`       | alphabetical letters | `@` `R` `C`      |

The renderer uses these buckets to keep visual weight consistent — terrain
recedes, infrastructure stands out, entities read as text.

## Worked example: a swamp world

```typescript
import type { MapConfig } from "@ursamu/map-plugin/schemas.ts";

export const swampConfig: MapConfig = {
  noise: {
    elevation: {
      seed: "swamp-elev-v1",
      scale: 32,
      octaves: [{ frequency: 1, amplitude: 1 }, { frequency: 3, amplitude: 0.4 }],
    },
    moisture: {
      seed: "swamp-moist-v1",
      scale: 32,
      octaves: [{ frequency: 1, amplitude: 1 }, { frequency: 3, amplitude: 0.4 }],
    },
  },
  biomes: [
    {
      id: "dryland", name: "Dryland", glyph: ".", color: "%cy", traversal: "easy",
      phrases: {
        self: ["packed earth rises above the waterline", "tufts of dry grass cover the rise"],
        adjacent: ["the ground lifts toward dry land"],
      },
    },
    {
      id: "mire", name: "Mire", glyph: ",", color: "%cg", traversal: "rough",
      phrases: {
        self: ["thick mire pulls at every step", "knotted roots break the wet ground"],
        adjacent: ["the mire deepens"],
      },
    },
    {
      id: "bog", name: "Bog", glyph: "~", color: "%cb", traversal: "hazard",
      phrases: {
        self: ["stagnant water blackens the basin", "a still bog reflects nothing"],
        adjacent: ["open bog stretches outward"],
      },
    },
  ],
  legend: {
    terrain: [".", ",", "~"],
    infrastructure: ["#", "+"],
    entities: ["@", "R"],
  },
  matrix: [
    { elevation: [0.0, 0.35], moisture: [0.55, 1.00], biome: "bog" },
    { elevation: [0.0, 0.60], moisture: [0.25, 0.55], biome: "mire" },
    { elevation: [0.0, 1.00], moisture: [0.0, 0.25], biome: "dryland" },
    { elevation: [0.60, 1.00], moisture: [0.0, 1.00], biome: "dryland" },
  ],
  viewportWidth: 15,
  viewportHeight: 7,
};
```

## Loading a custom config

Today the plugin's command handlers import `defaultMapConfig` directly from
`config.default.ts`. To use a custom config you currently have two options:

1. **Fork** the plugin and replace the contents of `config.default.ts`.
2. **Wrap** the plugin: import its renderer / topology functions directly from
   `topology.ts` and `renderer.ts`, passing your own `MapConfig` at the call
   site.

```typescript
import { sampleNeighborhood } from "@ursamu/map-plugin/topology.ts";
import { swampConfig } from "./swamp.config.ts";

const sample = sampleNeighborhood(swampConfig, { x: 0, y: 0, z: 0 });
```

**Roadmap limitation:** externalized config injection (a registration hook so
host muds can pass a `MapConfig` without forking) is not yet implemented. Until
it lands, prefer the wrapping approach for non-default worlds.
