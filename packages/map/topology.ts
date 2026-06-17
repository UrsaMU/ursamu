import { createNoise } from "ursamu";
import type {
  BiomeDefinition,
  Coord,
  MapConfig,
  MapNoiseConfig,
  NeighborhoodSample,
  TopologySample,
  WhittakerCell,
} from "./schemas.ts";

type Noise2D = (x: number, y: number) => number;

const Z_OFFSET_X = 131;
const Z_OFFSET_Y = 977;

const RING_OFFSETS: Array<{
  k: keyof NeighborhoodSample["ring"];
  dx: number;
  dy: number;
}> = [
  { k: "N", dx: 0, dy: -1 },
  { k: "NE", dx: 1, dy: -1 },
  { k: "E", dx: 1, dy: 0 },
  { k: "SE", dx: 1, dy: 1 },
  { k: "S", dx: 0, dy: 1 },
  { k: "SW", dx: -1, dy: 1 },
  { k: "W", dx: -1, dy: 0 },
  { k: "NW", dx: -1, dy: -1 },
];

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}

function makeNoise(seed: string): Noise2D {
  const instance = createNoise(hashSeed(seed));
  return (x, y) => instance.simplex2(x, y);
}

function sampleField(
  noise: Noise2D,
  cfg: MapNoiseConfig,
  coord: Coord,
): number {
  const scale = cfg.scale === 0 ? 1 : cfg.scale;
  const baseX = coord.x + coord.z * Z_OFFSET_X;
  const baseY = coord.y + coord.z * Z_OFFSET_Y;
  let total = 0;
  let ampSum = 0;
  for (const { frequency, amplitude } of cfg.octaves) {
    const nx = (baseX * frequency) / scale;
    const ny = (baseY * frequency) / scale;
    total += amplitude * noise(nx, ny);
    ampSum += Math.abs(amplitude);
  }
  if (ampSum === 0) return 0.5;
  const normalized = total / ampSum;
  const remapped = (normalized + 1) / 2;
  if (remapped < 0) return 0;
  if (remapped > 1) return 1;
  return remapped;
}

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

function resolveBiome(
  elevation: number,
  moisture: number,
  matrix: WhittakerCell[],
  biomes: BiomeDefinition[],
): BiomeDefinition {
  for (const cell of matrix) {
    if (inRange(elevation, cell.elevation) && inRange(moisture, cell.moisture)) {
      const found = biomes.find((b) => b.id === cell.biome);
      if (found) return found;
    }
  }
  return biomes[0];
}

export interface TopologyEngine {
  sample(coord: Coord): TopologySample;
  sampleNeighborhood(coord: Coord): NeighborhoodSample;
}

export function createTopologyEngine(config: MapConfig): TopologyEngine {
  const elevationNoise = makeNoise(config.noise.elevation.seed);
  const moistureNoise = makeNoise(config.noise.moisture.seed);

  const sample = (coord: Coord): TopologySample => {
    const elevation = sampleField(elevationNoise, config.noise.elevation, coord);
    const moisture = sampleField(moistureNoise, config.noise.moisture, coord);
    const biome = resolveBiome(elevation, moisture, config.matrix, config.biomes);
    return { coord, elevation, moisture, biome };
  };

  const sampleNeighborhood = (coord: Coord): NeighborhoodSample => {
    const centre = sample(coord);
    const partial: Partial<NeighborhoodSample["ring"]> = {};
    for (const { k, dx, dy } of RING_OFFSETS) {
      partial[k] = sample({ x: coord.x + dx, y: coord.y + dy, z: coord.z });
    }
    return { centre, ring: partial as NeighborhoodSample["ring"] };
  };

  return { sample, sampleNeighborhood };
}
