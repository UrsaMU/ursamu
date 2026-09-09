// core/registry.ts -- SplatRegistry singleton.
// Splat modules self-register on import; ChargenEngine never imports splat data directly.
import type { ISplat, SplatId } from "./types.ts";

const _splats = new Map<SplatId, ISplat>();

export const SplatRegistry = {
  register(splat: ISplat): void {
    _splats.set(splat.id, splat);
  },

  get(id: SplatId): ISplat | undefined {
    return _splats.get(id);
  },

  has(id: SplatId): boolean {
    return _splats.has(id);
  },

  list(): ISplat[] {
    return [..._splats.values()];
  },

  ids(): SplatId[] {
    return [..._splats.keys()];
  },
};
