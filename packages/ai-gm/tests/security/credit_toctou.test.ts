// ─── EXPLOIT: Credit TOCTOU Race Condition ────────────────────────────────────
//
// VULNERABILITY: monetization/credits.ts spendCredits() does:
//   1. Read wallet balance
//   2. Check if balance >= amount    (CHECK)
//   3. Decrement balance
//   4. Write wallet back             (USE)
//
//   Between steps 2 and 4, another concurrent call reads the same wallet.
//   Both pass the check and both decrement, resulting in balance going negative.
//   A player with 10 credits can spend 20+ credits via concurrent requests.
//
// Red phase: these tests FAIL before the fix (TOCTOU succeeds).
// Green phase: these tests PASS after the fix (balance never goes negative).

import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import {
  creditPlayer,
  getWallet,
  spendCredits,
} from "../../monetization/credits.ts";
import { gmWallets } from "../../monetization/db.ts";

// Unique player ID per test run to avoid collisions
const UID = `toctou-test-${Date.now()}`;

async function resetWallet(amount = 10): Promise<void> {
  // Clear any existing wallet and ledger entries for the test player
  await gmWallets.delete(
    { playerId: UID } as Parameters<typeof gmWallets.delete>[0],
  ).catch(() => {});
  await creditPlayer(UID, amount, "admin_grant");
}

Deno.test({
  name: "SECURITY: concurrent spends must not result in negative balance",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await resetWallet(10);

    // Fire two concurrent spend requests for 10 credits each (total = 20, but balance = 10)
    // Without atomic protection, both reads see balance=10, both pass, balance becomes -10.
    const results = await Promise.all([
      spendCredits(UID, 10, "oracle_use"),
      spendCredits(UID, 10, "oracle_use"),
    ]);

    const wallet = await getWallet(UID);

    // At most ONE spend should succeed (total available = 10)
    const successCount = results.filter(Boolean).length;
    assertEquals(
      successCount <= 1,
      true,
      `BUG: ${successCount} concurrent spends both succeeded with only 10 credits`,
    );

    // Balance must never go negative
    assertGreaterOrEqual(
      wallet.balance,
      0,
      `BUG: balance went to ${wallet.balance} — TOCTOU race allowed overdraft`,
    );
  },
});

Deno.test("SECURITY: spendCredits returns false when balance is exactly 0", async () => {
  await resetWallet(5);
  // Drain to 0
  await spendCredits(UID, 5, "oracle_use");
  const wallet = await getWallet(UID);
  assertEquals(wallet.balance, 0);

  // This spend must be rejected
  const ok = await spendCredits(UID, 1, "oracle_use");
  assertEquals(ok, false, "BUG: allowed spend on zero balance");
  const walletAfter = await getWallet(UID);
  assertEquals(walletAfter.balance, 0, "BUG: balance went negative");
});

Deno.test("SECURITY: totalSpent must never exceed totalEarned", async () => {
  await resetWallet(3);
  // Spend exactly 3 — should succeed
  await spendCredits(UID, 3, "oracle_use");
  const wallet = await getWallet(UID);
  assertEquals(
    wallet.totalSpent <= wallet.totalEarned,
    true,
    `BUG: totalSpent (${wallet.totalSpent}) > totalEarned (${wallet.totalEarned})`,
  );
});
