// WtA splat definition -- registers "wta" with SplatRegistry on module load.
import type { ISplat, IWtaSplatExt } from "../../core/types.ts";
import { SplatRegistry } from "../../core/registry.ts";
import { WTA_BREEDS } from "./data/breeds.ts";
import { WTA_AUSPICES } from "./data/auspices.ts";
import { WTA_TRIBES } from "./data/tribes.ts";
import { WTA_GIFTS } from "./data/gifts.ts";
import { WTA_RITES } from "./data/rites.ts";
import { WTA_MERITS, WTA_FLAWS } from "./data/merits.ts";
import { ATTR_ALLOC, ABIL_ALLOC } from "../../core/attributes.ts";

const wtaExt: IWtaSplatExt = {
  breeds: WTA_BREEDS,
  auspices: WTA_AUSPICES,
  tribes: WTA_TRIBES,
  gifts: WTA_GIFTS,
  rites: WTA_RITES,
};

const wtaSplat: ISplat = {
  id: "wta",
  name: "Werewolf: the Apocalypse",
  incapLabel: "Dying",
  overflowLabel: "Dead",
  attributeAlloc: ATTR_ALLOC,
  abilityAlloc: ABIL_ALLOC,
  backgroundDots: 5,
  freebies: 15,
  freebieTable: {
    attribute: 5,
    ability: 2,
    background: 1,
    gift: 7,
    rage: 1,
    gnosis: 2,
    willpower: 1,
  },
  merits: WTA_MERITS,
  flaws: WTA_FLAWS,
  ext: wtaExt,
};

SplatRegistry.register(wtaSplat);
