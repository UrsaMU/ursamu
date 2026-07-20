// CtL 2e Pledges — Seals, Oaths, and Bargains.

export type PledgeKind = "seal" | "oath" | "bargain";
export type OathType = "societal" | "personal" | "hostile" | "";

export interface PledgeRecord {
  id: string;
  kind: PledgeKind;
  /** "societal", "personal", "hostile" for oaths, empty for others. */
  oathType: OathType;
  /**
   * Player IDs involved:
   * - Seal: [sealerId, subjectId]
   * - Oath: [partyA, partyB, ...]
   * - Bargain: [changelingId, mortalId]
   */
  parties: string[];
  /** Display names of the parties at creation time. */
  partyNames: string[];
  statement: string;
  sanction: string;
  /** Optional boon/benefit. */
  boon?: string;
  duration?: string;
  status: "pending" | "active" | "broken" | "released";
  /** Whether the seal was strengthened (spends Willpower). */
  strengthened?: boolean;
  /** If broken, the reason why. */
  brokenReason?: string;
  createdAt: number;
  acceptedAt?: number;
  endedAt?: number;
  /** Contract to activate when broken (strengthened seal). */
  contractTrigger?: string;
}
