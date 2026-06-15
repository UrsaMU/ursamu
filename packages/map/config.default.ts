import type {
  BiomeDefinition,
  MapConfig,
  MapLegend,
  WhittakerCell,
} from "./schemas.ts";

const biomes: BiomeDefinition[] = [
  {
    id: "deep_water",
    name: "Deep Water",
    glyph: "~",
    color: "%cb",
    traversal: "impassable",
    phrases: {
      self: [
        "dark water fills the basin from edge to edge",
        "the surface lies flat and unbroken",
        "deep currents move slowly beneath a glassy skin",
      ],
      adjacent: [
        "open water stretches outward",
        "the basin deepens",
      ],
    },
  },
  {
    id: "shallows",
    name: "Shallows",
    glyph: ",",
    color: "%cc",
    traversal: "rough",
    phrases: {
      self: [
        "ankle-deep water laps over a silt bed",
        "reeds and standing water break up the ground",
      ],
      adjacent: [
        "the shallows ripple in the wind",
        "shallow water glints between hummocks",
      ],
    },
  },
  {
    id: "mudflats",
    name: "Mudflats",
    glyph: ".",
    color: "%cy",
    traversal: "rough",
    phrases: {
      self: [
        "cracked mudflats stretch in every direction",
        "a thick layer of clay covers the floor",
        "the ground is bare, drying, and split with seams",
      ],
      adjacent: [
        "mudflats slick from recent rain",
        "an open mud expanse",
      ],
    },
  },
  {
    id: "plains",
    name: "Plains",
    glyph: "t",
    color: "%cg",
    traversal: "easy",
    phrases: {
      self: [
        "tall grass rolls across an open plain",
        "a wide flat carries scattered tufts of growth",
      ],
      adjacent: [
        "grassland continues unbroken",
        "the plain runs out toward the horizon",
      ],
    },
  },
  {
    id: "brush",
    name: "Brush",
    glyph: "T",
    color: "%cg",
    traversal: "rough",
    phrases: {
      self: [
        "dense brush crowds the line of sight",
        "knotted scrub covers the rise",
        "tangled vegetation chokes the ground",
      ],
      adjacent: [
        "brush thickens at the edges",
        "the undergrowth deepens",
      ],
    },
  },
  {
    id: "ridge",
    name: "Ridge",
    glyph: "^",
    color: "%cw",
    traversal: "rough",
    phrases: {
      self: [
        "a stony ridge breaks the skyline",
        "broken rock climbs toward a crest",
      ],
      adjacent: [
        "ridges rise on the approach",
        "higher ground looms",
      ],
    },
  },
  {
    id: "road",
    name: "Road",
    glyph: "=",
    color: "%ch",
    traversal: "trivial",
    phrases: {
      self: [
        "a graded road cuts through the sector",
        "compacted track runs straight across the ground",
      ],
      adjacent: [
        "the road continues onward",
        "wheel ruts trail off in either direction",
      ],
    },
  },
];

const legend: MapLegend = {
  terrain: [".", ",", "~", "t", "T", "^"],
  infrastructure: ["#", "=", "+"],
  entities: ["@", "R", "C"],
};

const matrix: WhittakerCell[] = [
  { elevation: [0.0, 0.30], moisture: [0.60, 1.00], biome: "deep_water" },
  { elevation: [0.0, 0.40], moisture: [0.30, 0.60], biome: "shallows" },
  { elevation: [0.0, 0.45], moisture: [0.0, 0.30], biome: "mudflats" },
  { elevation: [0.30, 0.55], moisture: [0.0, 0.30], biome: "road" },
  { elevation: [0.30, 0.65], moisture: [0.30, 0.65], biome: "plains" },
  { elevation: [0.45, 0.70], moisture: [0.65, 1.00], biome: "brush" },
  { elevation: [0.70, 1.00], moisture: [0.0, 1.00], biome: "ridge" },
];

export const defaultMapConfig: MapConfig = {
  noise: {
    elevation: {
      seed: "ursamu-elevation-v1",
      scale: 24,
      octaves: [
        { frequency: 1, amplitude: 1 },
        { frequency: 2, amplitude: 0.5 },
        { frequency: 4, amplitude: 0.25 },
      ],
    },
    moisture: {
      seed: "ursamu-moisture-v1",
      scale: 24,
      octaves: [
        { frequency: 1, amplitude: 1 },
        { frequency: 2, amplitude: 0.5 },
        { frequency: 4, amplitude: 0.25 },
      ],
    },
  },
  biomes,
  legend,
  matrix,
  viewportWidth: 15,
  viewportHeight: 7,
};
