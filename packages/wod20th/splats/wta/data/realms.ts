// splats/wta/data/realms.ts -- W20 Umbral Realm catalog.
//
// Garou travel into the Penumbra via +stepside; the deeper Realms
// require ritual passage and are catalogued here for reference. Travel
// to arbitrary Realms is out of scope for v1 -- this is a browse-only
// catalog. The one exception is the Moon Bridge between caerns,
// handled in +stepside/moonbridge.
//
// Source: WtA W20 Ch 7 "The Spirit World" (Near / Deep Umbra).

export type RealmDepth = "near" | "deep";

export interface IRealmDef {
  slug: string;
  name: string;
  depth: RealmDepth;
  /** Local Gauntlet override; informational. Default Penumbra Gauntlet = room state. */
  gauntlet?: number;
  description: string;
  notes?: string;
}

export const WTA_REALMS: Record<string, IRealmDef> = {
  // -- Near Umbra ---------------------------------------------------------
  "penumbra": {
    slug: "penumbra", name: "The Penumbra", depth: "near",
    description:
      "The reflection of the material world. Where Garou normally arrive " +
      "when they step sideways; trees, rivers, and buildings appear as " +
      "spirit-echoes, alongside the Weaver's webwork.",
  },
  "membrane": {
    slug: "membrane", name: "The Membrane", depth: "near",
    description:
      "The thin skin between Penumbra and the deeper Umbra. Crossing it " +
      "into a Realm requires a moon bridge or a guide-spirit.",
  },
  "atrium": {
    slug: "atrium", name: "The Atrium", depth: "near",
    description:
      "The Weaver's outer halls -- gridded, geometric, dotted with pattern " +
      "spiders. Welcoming to logic and hostile to spontaneity.",
  },
  "flux-realm": {
    slug: "flux-realm", name: "The Flux Realm", depth: "near",
    description:
      "The Wyld's nearest expression -- raw possibility, swirling forms, " +
      "and unbound elementals. Inhospitable but rich with spirits.",
  },
  // -- Deep Umbra ---------------------------------------------------------
  "aetherial-realm": {
    slug: "aetherial-realm", name: "The Aetherial Realm", depth: "deep",
    description:
      "The celestial above -- planets, stars, and the Celestines (Helios, " +
      "Luna, the planetary Incarnae). Each celestial body is a Realm.",
  },
  "battleground": {
    slug: "battleground", name: "The Battleground", depth: "deep",
    description:
      "Endless war between spirits of conflict; Ahroun and warrior totems " +
      "find their lessons -- and their deaths -- here.",
  },
  "cyber-realm": {
    slug: "cyber-realm", name: "The CyberRealm", depth: "deep",
    description:
      "A Weaver bastion of pure machinery, fully sealed by pattern-webs. " +
      "Inhabited by Pattern Spiders and Weaver-Banes.",
  },
  "erebus": {
    slug: "erebus", name: "Erebus", depth: "deep",
    description:
      "The Dark Umbra -- realm of shadows and forgotten things. Wraiths " +
      "drift near its borders.",
  },
  "legendary-realm": {
    slug: "legendary-realm", name: "The Legendary Realm", depth: "deep",
    description:
      "A Realm built from collective memory: where mythic figures, lost " +
      "kingdoms, and the heroic past walk and breathe.",
  },
  "pangaea": {
    slug: "pangaea", name: "Pangaea", depth: "deep",
    description:
      "The mythic primal world before the Sundering. Lost paradise of " +
      "the original wolf packs; pilgrimage destination for breed totems.",
  },
  "scar": {
    slug: "scar", name: "The Scar", depth: "deep",
    description:
      "The Wyrm's stronghold -- the broken wound in the Tellurian where " +
      "the Triat went mad. Approach is a death sentence for the unwary.",
  },
  "summer-country": {
    slug: "summer-country", name: "The Summer Country", depth: "deep",
    description:
      "A Realm of perfect sunlit warmth and unending growth -- Wyld's " +
      "kindest face. Garou rest, heal, and remember here.",
  },
  "wolfhome": {
    slug: "wolfhome", name: "Wolfhome", depth: "deep",
    description:
      "The spirit-realm of all wolves. Lupus breed totems and ancient " +
      "wolf-spirits dwell here; lupus Garou consider it home.",
  },
  "umbral-glen": {
    slug: "umbral-glen", name: "The Umbral Glen", depth: "deep",
    description:
      "A neutral meeting-place spoken of in lore -- accessible only when " +
      "all parties consent. Used for parley between hostile spirit-courts.",
  },
};
