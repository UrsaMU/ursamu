/**
 * Party / crew support for auto-gigs.
 * Leader holds the run; crew share site + turn-in pay.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type {
  IActiveGig,
  IGigInvite,
  ISprawlChar,
} from "../db/schemas.ts";
import { getChar, saveChar } from "./sheet-io.ts";
import {
  applyGigComplete,
  type GigReward,
  rewardsForGig,
} from "./gigs.ts";
import { dbojs } from "@ursamu/ursamu";

export function leaderIdOf(gig: IActiveGig): string {
  return gig.leaderId || (gig.crewIds?.[0] ?? "");
}

export function crewIdsOf(gig: IActiveGig): string[] {
  const ids = gig.crewIds?.length
    ? [...gig.crewIds]
    : gig.leaderId
    ? [gig.leaderId]
    : [];
  return [...new Set(ids.filter(Boolean))];
}

export function isGigLeader(
  gig: IActiveGig | undefined,
  playerId: string,
): boolean {
  if (!gig) return false;
  const lid = leaderIdOf(gig);
  return !lid || lid === playerId;
}

export function isGigCrew(
  gig: IActiveGig | undefined,
  playerId: string,
): boolean {
  if (!gig) return false;
  return crewIdsOf(gig).includes(playerId) ||
    leaderIdOf(gig) === playerId;
}

/** NPC/system owner check — any crew member counts. */
export function isGigOwner(
  gig: IActiveGig | undefined,
  ownerId: string | undefined,
  actorId: string,
): boolean {
  if (!gig) return ownerId === actorId;
  if (isGigCrew(gig, actorId)) return true;
  return ownerId === actorId;
}

export async function loadCharById(
  playerId: string,
): Promise<{ obj: IDBObj; char: ISprawlChar } | null> {
  const raw = await dbojs.queryOne({ id: playerId });
  if (!raw) return null;
  // deno-lint-ignore no-explicit-any
  const obj = raw as any as IDBObj;
  const char = getChar(obj);
  if (!char?.chargenComplete) return null;
  return { obj, char };
}

/** Push leader's gig snapshot onto every crew sheet. */
export async function syncGigToCrew(
  u: IUrsamuSDK,
  leaderChar: ISprawlChar,
): Promise<void> {
  const gig = leaderChar.activeGig;
  if (!gig) return;
  const lid = leaderIdOf(gig) || u.me.id;
  const crew = crewIdsOf({
    ...gig,
    leaderId: lid,
    crewIds: gig.crewIds?.length
      ? gig.crewIds
      : [lid],
  });
  const snapshot: IActiveGig = {
    ...gig,
    leaderId: lid,
    crewIds: crew,
  };
  for (const id of crew) {
    if (id === u.me.id && isGigLeader(snapshot, u.me.id)) {
      continue;
    }
    const packed = await loadCharById(id);
    if (!packed) continue;
    // Don't clobber a different gig
    if (
      packed.char.activeGig &&
      packed.char.activeGig.id !== snapshot.id
    ) {
      continue;
    }
    await saveChar(u, {
      ...packed.char,
      activeGig: snapshot,
      gigInvite: undefined,
    }, id);
  }
}

export function withLeader(
  gig: IActiveGig,
  leaderId: string,
): IActiveGig {
  const crew = crewIdsOf(gig);
  if (!crew.includes(leaderId)) crew.unshift(leaderId);
  return {
    ...gig,
    leaderId,
    crewIds: [...new Set(crew)],
  };
}

export async function payCrewTurnin(
  u: IUrsamuSDK,
  leaderChar: ISprawlChar,
  gig: IActiveGig,
): Promise<{
  leaderNext: ISprawlChar;
  reward: GigReward;
  paid: string[];
}> {
  const reward = rewardsForGig(gig);
  const crew = crewIdsOf(withLeader(gig, leaderIdOf(gig) || u.me.id));
  const paid: string[] = [];

  // Leader first via normal complete
  const { next: leaderNext, reward: rw } = applyGigComplete(
    leaderChar,
    gig,
  );
  paid.push(u.me.id);

  for (const id of crew) {
    if (id === u.me.id) continue;
    const packed = await loadCharById(id);
    if (!packed) continue;
    // Same payout as leader (full share each)
    const { next } = applyGigComplete(packed.char, {
      ...gig,
      // ensure complete clears their copy
    });
    await saveChar(u, next, id);
    paid.push(id);
    try {
      u.send(
        `[Sprawl] Crew gig complete: ${gig.title}. ` +
          `+${rw.bityuan} b¥ · +${rw.ap} AP.`,
        id,
      );
    } catch {
      /* ok */
    }
  }

  return { leaderNext, reward: rw, paid };
}

export function formatCrewLine(gig: IActiveGig): string {
  const n = crewIdsOf(gig).length;
  if (n <= 1) return "  Crew: solo";
  return `  Crew: ${n} runners` +
    (gig.leaderId ? ` · lead #${gig.leaderId}` : "");
}

export function makeInvite(
  leader: ISprawlChar,
  leaderId: string,
  leaderName: string,
): IGigInvite | null {
  const gig = leader.activeGig;
  if (!gig) return null;
  return {
    leaderId,
    leaderName,
    gigId: gig.id,
    title: gig.title,
    tier: gig.tier,
    at: Date.now(),
  };
}
