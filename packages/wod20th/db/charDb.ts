// db/charDb.ts -- Typed DBO wrapper for wod20th.chars collection.
import { DBO } from "@ursamu/ursamu";
import type { IWoDChar, SplatId, CharStatus } from "../core/types.ts";

const db = new DBO<IWoDChar>("wod20th.chars");

/** Create a brand-new character record (draft, step 1). */
export async function createChar(playerId: string, splat: SplatId): Promise<IWoDChar> {
  const now = Date.now();
  const rec: IWoDChar = {
    id: crypto.randomUUID(),
    playerId,
    splat,
    status: "draft",
    chargenStep: 1,
    concept: "",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 3,
    freebiesRemaining: 15,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    staffNotes: "",
    statLog: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

/** Find a character by its own ID. */
export async function findById(id: string): Promise<IWoDChar | null> {
  const results = await db.find({ id });
  return results[0] ?? null;
}

/** Find a player's current (most recent) character, any status. */
export async function findByPlayer(playerId: string): Promise<IWoDChar | null> {
  const results = await db.find({ playerId });
  if (results.length === 0) return null;
  // Most recently created
  return results.sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** Find all submitted characters (staff queue). */
export async function findSubmitted(): Promise<IWoDChar[]> {
  return db.find({ status: "submitted" });
}

/** Persist a character using targeted $set writes (safe for concurrent access). */
export async function saveChar(char: IWoDChar): Promise<void> {
  const now = Date.now();
  await db.modify({ id: char.id }, "$set", {
    concept: char.concept,
    status: char.status,
    chargenStep: char.chargenStep,
    splat: char.splat,
    attributePriority: char.attributePriority,
    attributes: char.attributes,
    attributeSpecialties: char.attributeSpecialties,
    abilityPriority: char.abilityPriority,
    abilities: char.abilities,
    abilitySpecialties: char.abilitySpecialties,
    backgrounds: char.backgrounds,
    willpower: char.willpower,
    freebiesRemaining: char.freebiesRemaining,
    freebiesLog: char.freebiesLog,
    ...(char.freebiesDone !== undefined
      ? { freebiesDone: char.freebiesDone }
      : {}),
    xpTotal: char.xpTotal,
    xpSpent: char.xpSpent,
    staffNotes: char.staffNotes,
    statLog: char.statLog,
    notes: char.notes ?? [],
    ...(char.moniker !== undefined ? { moniker: char.moniker } : {}),
    ...(char.fullName !== undefined ? { fullName: char.fullName } : {}),
    ...(char.age !== undefined ? { age: char.age } : {}),
    ...(char.nature !== undefined ? { nature: char.nature } : {}),
    ...(char.demeanor !== undefined ? { demeanor: char.demeanor } : {}),
    ...(char.breed !== undefined ? { breed: char.breed } : {}),
    ...(char.auspice !== undefined ? { auspice: char.auspice } : {}),
    ...(char.tribe !== undefined ? { tribe: char.tribe } : {}),
    ...(char.deformity !== undefined ? { deformity: char.deformity } : {}),
    ...(char.merits !== undefined ? { merits: char.merits } : {}),
    ...(char.flaws !== undefined ? { flaws: char.flaws } : {}),
    ...(char.backgroundDetails !== undefined
      ? { backgroundDetails: char.backgroundDetails }
      : {}),
    ...(char.gifts !== undefined ? { gifts: char.gifts } : {}),
    ...(char.rites !== undefined ? { rites: char.rites } : {}),
    ...(char.comboGifts !== undefined ? { comboGifts: char.comboGifts } : {}),
    ...(char.scars !== undefined ? { scars: char.scars } : {}),
    ...(char.isNpc !== undefined ? { isNpc: char.isNpc } : {}),
    ...(char.npcTemplate !== undefined ? { npcTemplate: char.npcTemplate } : {}),
    ...(char.npcRoomId !== undefined ? { npcRoomId: char.npcRoomId } : {}),
    ...(char.npcKind !== undefined ? { npcKind: char.npcKind } : {}),
    ...(char.npcKills !== undefined ? { npcKills: char.npcKills } : {}),
    ...(char.titles !== undefined ? { titles: char.titles } : {}),
    ...(char.pronouns !== undefined ? { pronouns: char.pronouns } : {}),
    ...(char.ignoreWoundsUntil !== undefined ? { ignoreWoundsUntil: char.ignoreWoundsUntil } : {}),
    ...(char.renown !== undefined ? { renown: char.renown } : {}),
    ...(char.renownTemp !== undefined ? { renownTemp: char.renownTemp } : {}),
    ...(char.rage !== undefined ? { rage: char.rage } : {}),
    ...(char.gnosis !== undefined ? { gnosis: char.gnosis } : {}),
    ...(char.rank !== undefined ? { rank: char.rank } : {}),
    ...(char.attributesTemp !== undefined ? { attributesTemp: char.attributesTemp } : {}),
    ...(char.abilitiesTemp !== undefined ? { abilitiesTemp: char.abilitiesTemp } : {}),
    ...(char.rageCurrent !== undefined ? { rageCurrent: char.rageCurrent } : {}),
    ...(char.gnosisCurrent !== undefined ? { gnosisCurrent: char.gnosisCurrent } : {}),
    ...(char.willpowerCurrent !== undefined ? { willpowerCurrent: char.willpowerCurrent } : {}),
    ...(char.healthTrack !== undefined ? { healthTrack: char.healthTrack } : {}),
    ...(char.noRegenLethal !== undefined ? { noRegenLethal: char.noRegenLethal } : {}),
    ...(char.currentForm !== undefined ? { currentForm: char.currentForm } : {}),
    ...(char.frenzyState !== undefined ? { frenzyState: char.frenzyState } : {}),
    ...(char.frenzyUntil !== undefined ? { frenzyUntil: char.frenzyUntil } : {}),
    ...(char.inUmbra !== undefined ? { inUmbra: char.inUmbra } : {}),
    ...(char.deedName !== undefined ? { deedName: char.deedName } : {}),
    ...(char.voteHistory !== undefined ? { voteHistory: char.voteHistory } : {}),
    ...(char.packId !== undefined ? { packId: char.packId } : {}),
    ...(char.packInvites !== undefined ? { packInvites: char.packInvites } : {}),
    ...(char.pendingDefense !== undefined ? { pendingDefense: char.pendingDefense } : {}),
    ...(char.pendingChallengeDuel !== undefined ? { pendingChallengeDuel: char.pendingChallengeDuel } : {}),
    ...(char.actionDecl !== undefined ? { actionDecl: char.actionDecl } : {}),
    // -- VtM fields -----------------------------------------------------------
    ...(char.clan !== undefined ? { clan: char.clan } : {}),
    ...(char.generation !== undefined ? { generation: char.generation } : {}),
    ...(char.disciplines !== undefined ? { disciplines: char.disciplines } : {}),
    ...(char.virtues !== undefined ? { virtues: char.virtues } : {}),
    ...(char.humanity !== undefined ? { humanity: char.humanity } : {}),
    ...(char.path !== undefined ? { path: char.path } : {}),
    ...(char.bloodPool !== undefined ? { bloodPool: char.bloodPool } : {}),
    ...(char.bloodMax !== undefined ? { bloodMax: char.bloodMax } : {}),
    ...(char.bloodPerTurn !== undefined ? { bloodPerTurn: char.bloodPerTurn } : {}),
    ...(char.inTorpor !== undefined ? { inTorpor: char.inTorpor } : {}),
    ...(char.staked !== undefined ? { staked: char.staked } : {}),
    ...(char.feralWeapons !== undefined ? { feralWeapons: char.feralWeapons } : {}),
    ...(char.obfuscated !== undefined ? { obfuscated: char.obfuscated } : {}),
    ...(char.heightenedSenses !== undefined ? { heightenedSenses: char.heightenedSenses } : {}),
    ...(char.proteanForm !== undefined ? { proteanForm: char.proteanForm } : {}),
    ...(char.diablerieStains !== undefined ? { diablerieStains: char.diablerieStains } : {}),
    ...(char.bloodBuff !== undefined ? { bloodBuff: char.bloodBuff } : {}),
    ...(char.powerFlags !== undefined ? { powerFlags: char.powerFlags } : {}),
    ...(char.primaryPaths !== undefined ? { primaryPaths: char.primaryPaths } : {}),
    ...(char.rituals !== undefined ? { rituals: char.rituals } : {}),
    updatedAt: now,
    ...(char.approvedBy !== undefined ? { approvedBy: char.approvedBy } : {}),
    ...(char.deniedReason !== undefined ? { deniedReason: char.deniedReason } : {}),
  } as Partial<IWoDChar>);
}

/** Delete a character record. */
export async function deleteChar(id: string): Promise<void> {
  await db.delete({ id });
}

/**
 * Unset optional IWoDChar fields ($unset). Used for cases where the
 * conditional-spread pattern in saveChar cannot express removal.
 * Pass field names that are declared optional on IWoDChar.
 */
export async function unsetCharFields(
  id: string,
  fields: Array<keyof IWoDChar>,
): Promise<void> {
  if (fields.length === 0) return;
  const payload: Record<string, ""> = {};
  for (const f of fields) payload[f as string] = "";
  await db.modify({ id }, "$unset", payload as unknown as Partial<IWoDChar>);
}

/** Update status and optional approval fields atomically. */
export async function setStatus(
  id: string,
  status: CharStatus,
  extra?: { approvedBy?: string; deniedReason?: string },
): Promise<void> {
  await db.modify({ id }, "$set", {
    status,
    updatedAt: Date.now(),
    ...(extra ?? {}),
  } as Partial<IWoDChar>);
}
