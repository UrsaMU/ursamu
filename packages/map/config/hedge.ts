// Hedge / fae-flavored biome pack for Court-of-Roses style games.
// Register via plugins.map.theme = "hedge" | "court".

import type {
  BiomeDefinition,
  MapConfig,
  MapLegend,
  WhittakerCell,
} from "../schemas.ts";

const biomes: BiomeDefinition[] = [
  {
    id: "trods",
    name: "Trods",
    glyph: "=",
    color: "%ch%cy",
    traversal: "trivial",
    phrases: {
      self: [
        "a pale trod cuts a straight path through the Hedge",
        "worn thorns mark a traveler's road",
      ],
      adjacent: ["a trod continues onward", "thorn-lined path"],
    },
  },
  {
    id: "briar",
    name: "Briar",
    glyph: "T",
    color: "%cg",
    traversal: "rough",
    occludes: 0.4,
    phrases: {
      self: [
        "living briars claw at every step",
        "thorned thicket closes overhead",
      ],
      adjacent: ["briars thicken", "the Hedge grows denser"],
    },
  },
  {
    id: "glade",
    name: "Glade",
    glyph: "t",
    color: "%cg",
    traversal: "easy",
    phrases: {
      self: [
        "a rare open glade softens the thorns",
        "moss and pale grass claim a quiet hollow",
      ],
      adjacent: ["a glade opens nearby", "softer ground"],
    },
  },
  {
    id: "mire",
    name: "Mire",
    glyph: ",",
    color: "%cy",
    traversal: "rough",
    phrases: {
      self: [
        "black water seeps between root and stone",
        "a sucking mire hides the true path",
      ],
      adjacent: ["the ground turns wet", "mire pools"],
    },
  },
  {
    id: "goblin_market",
    name: "Market Edge",
    glyph: "+",
    color: "%cm",
    traversal: "easy",
    phrases: {
      self: [
        "lantern light and sharp laughter mark a market fringe",
        "stalls of impossible goods edge the path",
      ],
      adjacent: ["market noise carries", "goblin stalls"],
    },
  },
  {
    id: "hollow_wall",
    name: "Hollow Wall",
    glyph: "#",
    color: "%cw",
    traversal: "impassable",
    occludes: 1,
    phrases: {
      self: [
        "a wall of woven thorn and ironwood bars the way",
        "someone's Hollow boundary rises here",
      ],
      adjacent: ["a wall of thorns", "Hollow boundary"],
    },
  },
  {
    id: "deep_hedge",
    name: "Deep Hedge",
    glyph: "~",
    color: "%cb",
    traversal: "hazard",
    occludes: 0.6,
    phrases: {
      self: [
        "the Deep Hedge swallows sound and direction",
        "paths twist without logic in the deep green",
      ],
      adjacent: ["the Deep Hedge presses in", "direction frays"],
    },
  },
];

const legend: MapLegend = {
  terrain: [".", ",", "~", "t", "T", "="],
  infrastructure: ["#", "+", "*"],
  entities: ["@", "F", "H", "C"],
};

const matrix: WhittakerCell[] = [
  { elevation: [0.0, 0.25], moisture: [0.55, 1.0], biome: "deep_hedge" },
  { elevation: [0.0, 0.35], moisture: [0.25, 0.55], biome: "mire" },
  { elevation: [0.0, 0.40], moisture: [0.0, 0.25], biome: "glade" },
  { elevation: [0.25, 0.55], moisture: [0.0, 0.35], biome: "trods" },
  { elevation: [0.25, 0.65], moisture: [0.35, 0.70], biome: "briar" },
  { elevation: [0.40, 0.70], moisture: [0.70, 1.0], biome: "goblin_market" },
  { elevation: [0.65, 1.0], moisture: [0.0, 1.0], biome: "hollow_wall" },
];

/** Court / Hedge realm default config. */
export const hedgeMapConfig: MapConfig = {
  noise: {
    elevation: {
      seed: "court-hedge-elevation-v1",
      scale: 20,
      octaves: [
        { frequency: 1, amplitude: 1 },
        { frequency: 2, amplitude: 0.5 },
        { frequency: 4, amplitude: 0.25 },
      ],
    },
    moisture: {
      seed: "court-hedge-moisture-v1",
      scale: 22,
      octaves: [
        { frequency: 1, amplitude: 1 },
        { frequency: 2, amplitude: 0.45 },
        { frequency: 4, amplitude: 0.2 },
      ],
    },
  },
  biomes,
  legend,
  matrix,
  viewportWidth: 15,
  viewportHeight: 7,
  regions: [
    {
      slug: "near-trods",
      name: "Near Trods",
      aabb: [
        { x: -40, y: -40, z: 0 },
        { x: 40, y: 40, z: 0 },
      ],
      tags: ["safe-ish", "trods"],
    },
    {
      slug: "deep",
      name: "Deep Hedge",
      aabb: [
        { x: -200, y: -200, z: 0 },
        { x: 200, y: 200, z: 0 },
      ],
      tags: ["hazard"],
    },
  ],
};
