// Typed re-exports of the canonical Virtue/Vice catalog from resources/anchors.json.

const anchorsUrl = new URL("../../resources/anchors.json", import.meta.url);
const anchorsData = JSON.parse(Deno.readTextFileSync(anchorsUrl));

export interface CofdAnchor {
  readonly name: string;
  readonly description: string;
  readonly willpowerTrigger: string;
}

export const COFD_VIRTUES: readonly CofdAnchor[] = Object.freeze(
  (anchorsData.virtues as CofdAnchor[]).map((v) => Object.freeze({ ...v })),
);

export const COFD_VICES: readonly CofdAnchor[] = Object.freeze(
  (anchorsData.vices as CofdAnchor[]).map((v) => Object.freeze({ ...v })),
);

export const COFD_VIRTUE_NAMES: readonly string[] = Object.freeze(
  COFD_VIRTUES.map((v) => v.name),
);

export const COFD_VICE_NAMES: readonly string[] = Object.freeze(
  COFD_VICES.map((v) => v.name),
);

export function findVirtue(name: string): CofdAnchor | null {
  const q = name.trim().toLowerCase();
  return COFD_VIRTUES.find((v) => v.name.toLowerCase() === q) ?? null;
}

export function findVice(name: string): CofdAnchor | null {
  const q = name.trim().toLowerCase();
  return COFD_VICES.find((v) => v.name.toLowerCase() === q) ?? null;
}
