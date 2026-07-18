// Cross-plugin glue: deliver a system mail message via @ursamu/mail.
// Failures are swallowed so approve/deny still work if mail is offline.

import { mailDb, type IMail } from "@ursamu/mail";

export type { IMail };

/** Sentinel "from" id when the sender is the engine, not a player. */
const SYSTEM_SENDER = "#0";

export interface CofdMailOptions {
  to: string;
  subject: string;
  body: string;
}

/**
 * Insert a single system-sent mail into `mail.messages`. Failures are
 * logged but never thrown -- a missing mail plugin must not break the
 * caller (approve/deny/beat-award stay functional).
 */
export async function sendCofdMail(
  opts: CofdMailOptions,
): Promise<void> {
  const now = Date.now();
  const mail: IMail = {
    id: `mail-cofd-${now}-${Math.floor(Math.random() * 1e6)}`,
    from: SYSTEM_SENDER,
    to: [opts.to],
    subject: opts.subject,
    message: opts.body,
    date: now,
    read: false,
    folder: "inbox",
  };
  try {
    await mailDb.create(mail);
  } catch (err) {
    console.error("[cofd] mail delivery failed:", err);
  }
}
