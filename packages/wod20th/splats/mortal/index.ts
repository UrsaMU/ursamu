// Mortal splat -- no supernatural extension.
// Attributes + abilities + backgrounds + willpower only.
import type { ISplat } from "../../core/types.ts";
import { SplatRegistry } from "../../core/registry.ts";
import { ATTR_ALLOC, ABIL_ALLOC } from "../../core/attributes.ts";

const mortalSplat: ISplat = {
  id: "mortal",
  name: "Mortal",
  incapLabel: "Dead",
  overflowLabel: "Dead",
  attributeAlloc: ATTR_ALLOC,
  abilityAlloc: ABIL_ALLOC,
  backgroundDots: 5,
  freebies: 15,
  freebieTable: {
    attribute: 5,
    ability: 2,
    background: 1,
    willpower: 1,
  },
  initialWillpower: 3,
};

SplatRegistry.register(mortalSplat);
