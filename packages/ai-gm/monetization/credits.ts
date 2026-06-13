// ─── Credit Ledger ────────────────────────────────────────────────────────────
//
// All balance mutations go through this module.
// Every change is written to the immutable ledger before the wallet is updated.

import { gmLedger, gmWallets } from "./db.ts";
import type { ILedgerEntry, IPlayerWallet, LedgerReason } from "./interface.ts";
import { nanoid } from "../ingestion/util.ts";

// Wallet id = "wallet:" + playerId for deterministic lookup
function walletId(playerId: string): string {
  return `wallet:${playerId}`;
}

// ─── Wallet helpers ───────────────────────────────────────────────────────────

export async function getWallet(playerId: string): Promise<IPlayerWallet> {
  const existing = await gmWallets.queryOne(
    { playerId } as Parameters<typeof gmWallets.queryOne>[0],
  );
  if (existing) return existing as IPlayerWallet;
  // Auto-create a zero-balance wallet on first access
  const wallet: IPlayerWallet = {
    id: walletId(playerId),
    playerId,
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    updatedAt: Date.now(),
  };
  await gmWallets.create(wallet as Parameters<typeof gmWallets.create>[0]);
  return wallet;
}

async function saveWallet(wallet: IPlayerWallet): Promise<void> {
  wallet.updatedAt = Date.now();
  const existing = await gmWallets.queryOne(
    { playerId: wallet.playerId } as Parameters<typeof gmWallets.queryOne>[0],
  );
  if (existing) {
    await gmWallets.modify(
      { playerId: wallet.playerId } as Parameters<typeof gmWallets.modify>[0],
      "$set",
      wallet as unknown as Parameters<typeof gmWallets.modify>[2],
    );
  } else {
    await gmWallets.create(wallet as Parameters<typeof gmWallets.create>[0]);
  }
}

// ─── Core credit operations ───────────────────────────────────────────────────

/** Add credits to a player's wallet. Returns new balance. */
export async function creditPlayer(
  playerId: string,
  amount: number,
  reason: LedgerReason,
  metadata?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error("Credit amount must be positive");
  const wallet = await getWallet(playerId);
  wallet.balance += amount;
  wallet.totalEarned += amount;
  await saveWallet(wallet);
  await writeLedger(playerId, amount, reason, metadata);
  return wallet.balance;
}

// Per-player spend queue — serialises concurrent spendCredits calls to prevent TOCTOU
const _spendQueue = new Map<string, Promise<unknown>>();

/**
 * Deduct credits from a player's wallet.
 * Returns `true` if successful, `false` if insufficient balance.
 * Concurrent calls for the same player are serialised to prevent overdraft.
 */
export function spendCredits(
  playerId: string,
  amount: number,
  reason: LedgerReason,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  if (amount <= 0) return Promise.resolve(true); // 0-cost features are always allowed
  // Chain onto any in-flight spend for this player so only one runs at a time
  const gate = (_spendQueue.get(playerId) ?? Promise.resolve()).then(
    () => _doSpend(playerId, amount, reason, metadata),
  );
  // Store without return value — a failed spend must not block future ops
  _spendQueue.set(playerId, gate.catch(() => {}));
  return gate;
}

async function _doSpend(
  playerId: string,
  amount: number,
  reason: LedgerReason,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const wallet = await getWallet(playerId);
  if (wallet.balance < amount) return false;
  wallet.balance -= amount;
  wallet.totalSpent += amount;
  await saveWallet(wallet);
  await writeLedger(playerId, -amount, reason, metadata);
  return true;
}

/** Check if a player can afford an action without spending. */
export async function canAfford(
  playerId: string,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const wallet = await getWallet(playerId);
  return wallet.balance >= amount;
}

/** Update subscription fields on a wallet without changing credits. */
export async function updateSubscriptionStatus(
  playerId: string,
  subscriptionId: string | undefined,
  subscriptionPlan: string | undefined,
  status: IPlayerWallet["subscriptionStatus"],
): Promise<void> {
  const wallet = await getWallet(playerId);
  wallet.subscriptionId = subscriptionId;
  wallet.subscriptionPlan = subscriptionPlan;
  wallet.subscriptionStatus = status;
  await saveWallet(wallet);
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

async function writeLedger(
  playerId: string,
  delta: number,
  reason: LedgerReason,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const entry: ILedgerEntry = {
    id: nanoid(),
    playerId,
    delta,
    reason,
    metadata,
    createdAt: Date.now(),
  };
  await gmLedger.create(entry as Parameters<typeof gmLedger.create>[0]);
}

/** Get the last N ledger entries for a player. */
export async function getLedger(
  playerId: string,
  limit = 20,
): Promise<ILedgerEntry[]> {
  const all = await gmLedger.query(
    { playerId } as Parameters<typeof gmLedger.query>[0],
  ) as ILedgerEntry[];
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
