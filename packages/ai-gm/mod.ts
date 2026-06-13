/**
 * @ursamu/ai-gm
 *
 * Agentic AI Game Master for UrsaMU.
 * Install via: ursamu plugin install https://github.com/ursamu/ai-gm
 */

export { default } from "./index.ts";
export type {
  IGMConfig,
  IGMExchange,
  IGMMemory,
  IGMReveal,
  IGMRound,
  IGMSession,
} from "./schema.ts";
export type { IGameSystem } from "./systems/interface.ts";
export {
  getGameSystem,
  getGameSystemNames,
  registerGameSystem,
} from "./systems/store.ts";
// Monetization
export type {
  IFeatureCosts,
  ILedgerEntry,
  IPaymentAdapter,
  IPlayerWallet,
  ISubscriptionPlan,
} from "./monetization/interface.ts";
export {
  canAfford,
  creditPlayer,
  getWallet,
  spendCredits,
} from "./monetization/credits.ts";
export { getPlan, getPlans, setPlans } from "./monetization/plans.ts";
export {
  chargeGate,
  checkGate,
  setFeatureCosts,
} from "./monetization/gates.ts";
export { nullPaymentAdapter } from "./monetization/null-adapter.ts";
export {
  createStripeAdapter,
  createStripeAdapterFromEnv,
} from "./monetization/stripe/adapter.ts";
// Social
export type { IJournalEntry } from "./social/journal.ts";
export {
  formatJournalEntry,
  getJournalEntries,
  getJournalEntry,
} from "./social/journal.ts";
export type { ISpotlightEntry } from "./social/spotlight.ts";
export { getSpotlights, recordSpotlight } from "./social/spotlight.ts";
export type { IPersona } from "./social/persona.ts";
export {
  activatePersona,
  createPersona,
  getPersonasForPlayer,
  resolveDisplayName,
} from "./social/persona.ts";
export { discordEnabled, sendToDiscord } from "./social/discord.ts";
// REST API
export { handleGmRequest } from "./api/routes.ts";
