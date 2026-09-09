// VtM splat -- Vampire: the Masquerade 20th Anniversary.
import type { ISplat, IVtmSplatExt } from "../../core/types.ts";
import { SplatRegistry } from "../../core/registry.ts";
import { ATTR_ALLOC, ABIL_ALLOC } from "../../core/attributes.ts";
import { VTM_CLANS } from "./data/clans.ts";
import { VTM_DISCIPLINES } from "./data/disciplines.ts";
import { VTM_BACKGROUNDS } from "./data/backgrounds.ts";
import { VTM_GENERATION_TABLE } from "./data/generation.ts";
import { VTM_MERITS, VTM_FLAWS } from "./data/merits.ts";

const vtmExt: IVtmSplatExt = {
  clans: [...VTM_CLANS],
  disciplines: VTM_DISCIPLINES,
  backgrounds: [...VTM_BACKGROUNDS],
  generationTable: [...VTM_GENERATION_TABLE],
  startingDisciplineDots: 3,
  virtueDots: 7,
};

const vtmSplat: ISplat = {
  id: "vtm",
  name: "Vampire: the Masquerade",
  incapLabel: "Torpor",
  overflowLabel: "Final Death",
  attributeAlloc: ATTR_ALLOC,
  abilityAlloc: ABIL_ALLOC,
  backgroundDots: 5,
  freebies: 15,
  freebieTable: {
    attribute: 5,
    ability: 2,
    background: 1,
    discipline: 7,
    virtue: 2,
    humanity: 1,
    willpower: 1,
  },
  // Courage starts at base-1; seedPools sets WP = Courage after virtues.
  initialWillpower: 1,
  merits: [...VTM_MERITS],
  flaws: [...VTM_FLAWS],
  ext: vtmExt,
};

SplatRegistry.register(vtmSplat);
