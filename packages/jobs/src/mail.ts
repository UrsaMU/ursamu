// ─── Job mail helper — writes to engine's server.mail KV collection ──────────

import { DBO } from "@ursamu/mush";

/** Matches the engine's IMail interface (fields used for job notifications). */
interface IMail {
  id: string;
  from: string;
  to: string[];
  message: string;
  subject: string;
  date: number;
  read: boolean;
}

// Accesses the same KV collection as the engine's internal `mail` DBO.
const mailDBO = new DBO<IMail>("server.mail");

/**
 * Creates a mail entry in the engine's mail collection so a player receives
 * an in-game notification about a job event.
 *
 * Silently swallows errors — mail failure must never interrupt job operations.
 *
 * @param fromId  DB id of the sending player (without `#` prefix)
 * @param toId    DB id of the recipient player (without `#` prefix)
 * @param subject Mail subject line
 * @param body    Mail body text
 */
export async function sendJobMail(
  fromId: string,
  toId: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    await mailDBO.create({
      id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: `#${fromId}`,
      to: [`#${toId}`],
      subject,
      message: body,
      date: Date.now(),
      read: false,
    });
  } catch {
    // Mail failure must not interrupt job operations
  }
}
