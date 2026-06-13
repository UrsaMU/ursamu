// ─── Monetization DB Collections ─────────────────────────────────────────────

import { DBO } from "ursamu";
import type { ILedgerEntry, IPlayerWallet } from "./interface.ts";

export const gmWallets = new DBO<IPlayerWallet>("server.gm.wallets");
export const gmLedger = new DBO<ILedgerEntry>("server.gm.ledger");
