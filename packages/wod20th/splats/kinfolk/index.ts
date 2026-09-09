// Kinfolk splat -- mortal base + gnosis 1 + small gift access.
import type { ISplat, IKinfolkSplatExt } from "../../core/types.ts";
import { SplatRegistry } from "../../core/registry.ts";
import { ATTR_ALLOC, ABIL_ALLOC } from "../../core/attributes.ts";

const kinfolkExt: IKinfolkSplatExt = {
  initialGnosis: 1,
  availableGifts: [
    "Sense Wyrm",
    "Resist Toxin",
    "Smell of Man",
    "Cooking",
  ],
};

const kinfolkSplat: ISplat = {
  id: "kinfolk",
  name: "Kinfolk",
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
    gnosis: 2,
    willpower: 1,
  },
  initialWillpower: 3,
  ext: kinfolkExt,
};

SplatRegistry.register(kinfolkSplat);
