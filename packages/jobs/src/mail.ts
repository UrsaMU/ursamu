// Job mail helper — delivers via @ursamu/mail when installed.
// Failures are swallowed so job ops never break on mail errors.

import { mailDb, type IMail } from "@ursamu/mail";

/**
 * Creates a mail entry so a player receives an in-game notification
 * about a job event.
 *
 * Silently swallows errors — mail failure must never interrupt jobs.
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
    const mail: IMail = {
      id: `mail-${Date.now()}-${
        Math.random().toString(36).slice(2, 7)
      }`,
      from: `#${fromId}`,
      to: [`#${toId}`],
      subject,
      message: body,
      date: Date.now(),
      read: false,
      folder: "inbox",
    };
    await mailDb.create(mail);
  } catch {
    // Mail failure must not interrupt job operations
  }
}
