/** Adventure site + treasure table + dungeon skin shapes. */

export interface AdvRoomDef {
  key: string;
  name: string;
  description: string;
}

export interface AdvExitDef {
  from: string;
  to: string;
  name: string;
}

export interface AdvMobDef {
  room: string;
  name: string;
  template: string;
}

export interface AdvChestDef {
  room: string;
  name: string;
  table: string;
}

/** Scenery / interactable props (chest, view, altar, campfire…). */
export interface AdvPropDef {
  room: string;
  name: string;
  /** chest | view | altar | campfire | scenery */
  kind: string;
  description: string;
  /** Loot table for chests. */
  table?: string;
}

export interface AdventureDef {
  slug: string;
  name: string;
  tier: number;
  xpHint?: number;
  book?: string;
  summary: string;
  entryKey: string;
  /** Starter-world room key to link from (optional). */
  linkFromWorld?: string;
  exitNameToSite?: string;
  exitNameFromSite?: string;
  /** Skin used to generate this run, if procedural. */
  skin?: string;
  kind?: "dungeon" | "camp";
  /** Party size used when generating mob counts. */
  partySize?: number;
  rooms: AdvRoomDef[];
  exits: AdvExitDef[];
  mobs: AdvMobDef[];
  chests?: AdvChestDef[];
  props?: AdvPropDef[];
}

export interface SkinMobPool {
  template: string;
  names: string[];
}

export interface SkinPropPool {
  chance: number;
  tables?: string[];
  names: string[];
  descs?: string[];
}

/** Procedural dungeon/camp skin (resources/dungeon-skins.json). */
export interface DungeonSkin {
  slug: string;
  name: string;
  kind: "dungeon" | "camp";
  tier: number;
  book?: string;
  summary: string;
  linkFromWorld?: string;
  exitNameToSite?: string;
  exitNameFromSite?: string;
  roomsMin: number;
  roomsMax: number;
  roomNames: string[];
  roomDescs: string[];
  fodder: SkinMobPool[];
  boss: { template: string; names: string[] };
  bossLoot: string;
  /** [min, max] fodder spawns per non-boss room. */
  fodderPerRoom: [number, number];
  props: {
    chest?: SkinPropPool;
    view?: SkinPropPool;
    altar?: SkinPropPool;
    campfire?: SkinPropPool;
  };
}

export interface TreasureEntry {
  chance: number;
  gp?: string;
  item?: string;
  type?: string;
  /** Magic item slug from magic-items.json */
  magic?: string;
}

export interface TreasureTable {
  slug: string;
  name: string;
  book?: string;
  entries: TreasureEntry[];
}

export interface AdventureInstance {
  id: string;
  slug: string;
  at: number;
  /** room key → db id */
  rooms: Record<string, string>;
  mobIds: string[];
  chestIds: string[];
  propIds?: string[];
  entryId: string;
  /** world room we linked from, if any */
  anchorId?: string;
  cleared: boolean;
  /** Skin slug if procedural run. */
  skin?: string;
  kind?: "dungeon" | "camp";
}
