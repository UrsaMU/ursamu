/**
 * GameHookMap declaration merging for Cyberpunk RED events.
 * Import this file in index.ts to activate typed hooks across the plugin.
 */
import type {
  ICPRAttackPayload,
  ICPRWoundPayload,
  ICPRDeathSavePayload,
  ICPRCritPayload,
  ICPRMarketPayload,
  ICPRTransactionPayload,
  ICPRCraftPayload,
  ICPRJobPayload,
  ICPRScavengePayload,
  ICombatState,
  ICriticalInjury,
  ICPRGMPayload,
} from "../db/schemas.ts";

declare module "jsr:@ursamu/ursamu" {
  interface GameHookMap {
    // -- Combat ----------------------------------------------------------
    "cpr:combat:start": (payload: {
      roomId: string;
      startedBy: string;
      participants: { actorId: string; name: string }[];
    }) => void | Promise<void>;

    "cpr:combat:end": (payload: {
      roomId: string;
      rounds: number;
      state: ICombatState;
    }) => void | Promise<void>;

    "cpr:combat:turn": (payload: {
      roomId: string;
      actorId: string;
      actorName: string;
      round: number;
    }) => void | Promise<void>;

    "cpr:attack:resolved": (payload: ICPRAttackPayload) => void | Promise<void>;

    "cpr:wound:changed": (payload: ICPRWoundPayload) => void | Promise<void>;

    "cpr:death_save:rolled": (
      payload: ICPRDeathSavePayload
    ) => void | Promise<void>;

    "cpr:death_save:failed": (payload: {
      actorId: string;
      actorName: string;
    }) => void | Promise<void>;

    "cpr:critical_injury": (payload: ICPRCritPayload) => void | Promise<void>;

    "cpr:stabilized": (payload: {
      actorId: string;
      actorName: string;
      byId: string;
      byName: string;
    }) => void | Promise<void>;

    // -- Character Development --------------------------------------------
    "cpr:chargen:complete": (payload: {
      actorId: string;
      actorName: string;
      role: string;
      method: string;
    }) => void | Promise<void>;

    "cpr:cyberware:installed": (payload: {
      actorId: string;
      actorName: string;
      item: string;
      hlAdded: number;
      totalHl: number;
      currentEmp: number;
    }) => void | Promise<void>;

    "cpr:cyberpsychosis:threshold": (payload: {
      actorId: string;
      actorName: string;
      hl: number;
      empCurrent: number;
    }) => void | Promise<void>;

    "cpr:cyberpsychosis:reduced": (payload: {
      actorId: string;
      actorName: string;
      hlReduced: number;
      empGained: number;
      newEmp: number;
    }) => void | Promise<void>;

    "cpr:reputation:gained": (payload: {
      actorId: string;
      actorName: string;
      oldRep: number;
      newRep: number;
      deed: string;
    }) => void | Promise<void>;

    "cpr:role:ability": (payload: {
      actorId: string;
      actorName: string;
      role: string;
      abilityName: string;
      rank: number;
      context: Record<string, unknown>;
    }) => void | Promise<void>;

    // -- Netrunning -------------------------------------------------------
    "cpr:netrun:action": (payload: {
      actorId: string;
      actorName: string;
      ability: string;
      target?: string;
      roll: number;
      dv: number;
      success: boolean;
    }) => void | Promise<void>;

    "cpr:netrun:ice_hit": (payload: {
      actorId: string;
      actorName: string;
      iceName: string;
      damage: number;
    }) => void | Promise<void>;

    "cpr:netrun:breach": (payload: {
      actorId: string;
      actorName: string;
      architectureId: string;
      floor: number;
    }) => void | Promise<void>;

    "cpr:netrun:complete": (payload: {
      actorId: string;
      actorName: string;
      architectureId: string;
      success: boolean;
    }) => void | Promise<void>;

    // -- Economy ----------------------------------------------------------
    "cpr:market:opened": (payload: ICPRMarketPayload) => void | Promise<void>;
    "cpr:market:closed": (payload: ICPRMarketPayload) => void | Promise<void>;

    "cpr:market:listed": (payload: {
      marketId: string;
      sellerId: string;
      sellerName: string;
      itemName: string;
      price: number;
    }) => void | Promise<void>;

    "cpr:market:transaction": (
      payload: ICPRTransactionPayload
    ) => void | Promise<void>;

    "cpr:market:haggle": (payload: {
      marketId: string;
      fixerId: string;
      fixerName: string;
      itemName: string;
      originalPrice: number;
      newPrice: number;
      success: boolean;
    }) => void | Promise<void>;

    "cpr:lifestyle:paid": (payload: {
      actorId: string;
      actorName: string;
      tier: string;
      amount: number;
      nextDueDate: number;
    }) => void | Promise<void>;

    "cpr:lifestyle:defaulted": (payload: {
      actorId: string;
      actorName: string;
      tier: string;
      amountOwed: number;
    }) => void | Promise<void>;

    // -- Crafting & Services ----------------------------------------------
    "cpr:craft:started": (payload: ICPRCraftPayload) => void | Promise<void>;

    "cpr:craft:progress": (payload: ICPRCraftPayload & {
      roll: number;
      dv: number;
      success: boolean;
    }) => void | Promise<void>;

    "cpr:craft:completed": (payload: ICPRCraftPayload) => void | Promise<void>;
    "cpr:craft:failed": (payload: ICPRCraftPayload) => void | Promise<void>;

    "cpr:chopshop:harvest": (payload: {
      medtechId: string;
      medtechName: string;
      patientId: string;
      cyberwareName: string;
      success: boolean;
    }) => void | Promise<void>;

    "cpr:chopshop:install_complete": (payload: {
      medtechId: string;
      patientId: string;
      patientName: string;
      cyberwareName: string;
      hlAdded: number;
      success: boolean;
    }) => void | Promise<void>;

    "cpr:bodysculpt:completed": (payload: {
      medtechId: string;
      patientId: string;
      patientName: string;
      modification: string;
      exotic: boolean;
      hlAdded: number;
    }) => void | Promise<void>;

    "cpr:pharma:synthesized": (payload: {
      medtechId: string;
      medtechName: string;
      drugName: string;
      quantity: number;
    }) => void | Promise<void>;

    "cpr:pharma:effect_applied": (payload: {
      actorId: string;
      actorName: string;
      drugName: string;
      effect: string;
      expiresAt: number;
    }) => void | Promise<void>;

    "cpr:pharma:effect_expired": (payload: {
      actorId: string;
      actorName: string;
      drugName: string;
    }) => void | Promise<void>;

    "cpr:therapy:session": (payload: {
      medtechId: string;
      patientId: string;
      patientName: string;
      hlReduced: number;
      roll: number;
      dv: number;
      success: boolean;
    }) => void | Promise<void>;

    // -- Jobs & World -----------------------------------------------------
    "cpr:job:posted": (payload: ICPRJobPayload) => void | Promise<void>;
    "cpr:job:taken": (payload: ICPRJobPayload) => void | Promise<void>;
    "cpr:job:completed": (payload: ICPRJobPayload) => void | Promise<void>;
    "cpr:job:abandoned": (payload: ICPRJobPayload) => void | Promise<void>;

    "cpr:run:started": (payload: {
      runId: string;
      roomId: string;
      title: string;
      crewIds: string[];
    }) => void | Promise<void>;
    "cpr:run:phase": (payload: {
      runId: string;
      roomId: string;
      phaseIndex: number;
      phaseTitle: string;
      kind: string;
    }) => void | Promise<void>;
    "cpr:run:completed": (payload: {
      runId: string;
      roomId: string;
      title: string;
      payoutEb: number;
      crewIds: string[];
    }) => void | Promise<void>;
    "cpr:run:aborted": (payload: {
      runId: string;
      roomId: string;
    }) => void | Promise<void>;

    "cpr:scavenge:rolled": (payload: ICPRScavengePayload) => void | Promise<void>;
    "cpr:scavenge:found": (payload: ICPRScavengePayload) => void | Promise<void>;
    "cpr:scavenge:ambushed": (payload: ICPRScavengePayload) => void | Promise<void>;

    // -- GM Bridge (IGMEventPayload-compatible -- consumed by ai-gm dynamic subscriptions) --
    // These events carry plain-text summaries for LLM injection. They are listed
    // in the gm:system:register `events` array so ai-gm subscribes dynamically.
    "cpr:roll":              (payload: ICPRGMPayload) => void | Promise<void>;
    "cpr:attack:hit":        (payload: ICPRGMPayload) => void | Promise<void>;
    "cpr:rest:completed":    (payload: ICPRGMPayload) => void | Promise<void>;
    "cpr:humanity:gained":   (payload: ICPRGMPayload) => void | Promise<void>;
    "cpr:brawl:resolved":    (payload: ICPRGMPayload) => void | Promise<void>;
  }
}
