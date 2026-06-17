import { DBO } from "@ursamu/mush";

/** Maximum inbox messages per player before deliveries are skipped. */
export const MAIL_QUOTA = 100;

/** Expiry sweep interval — once per hour. */
export const EXPIRY_SWEEP_MS = 60 * 60 * 1000;

/**
 * A single mail message stored in the `mail.messages` collection.
 *
 * Shared-record model: one document per sent message.
 * Recipients filter via `{ to: { $in: ["#<id>"] } }`.
 */
export interface IMail {
  id: string;
  /** "#<id>" of sender. */
  from: string;
  /** ["#<id>", ...] of primary recipients. */
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  date: number;
  read: boolean;
  replied?: boolean;
  forwarded?: boolean;
  /** Protected from deletion — must /unsave before /delete. */
  starred?: boolean;
  /** "inbox" (default) or "trash". */
  folder?: "inbox" | "trash";
  /** Unix ms timestamp after which this message is auto-purged. */
  expiresAt?: number;
  /** Array of "#<id>" dbrefs attached to the message. */
  attachments?: string[];
}

export const mailDb = new DBO<IMail>("mail.messages");
