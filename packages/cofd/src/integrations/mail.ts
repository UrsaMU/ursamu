// Cross-plugin glue: deliver a system mail message to a player via the
// mail plugin's `mail.messages` collection. Loose-coupled: we construct
// our own DBO referencing the same collection name rather than importing
// the plugin's private mailDb singleton.
//
// IMail is duplicated here (not imported from @ursamu/mail) so this
// package publishes without a hard JSR dep on mail, which is optional.

import { DBO } from "@ursamu/ursamu";

/** Subset of mail-plugin IMail used for system deliveries. */
export interface IMail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  message: string;
  date: number;
  read: boolean;
  folder?: "inbox" | "trash";
}

const mailDb = new DBO<IMail>("mail.messages");

/** Sentinel "from" id used when the sender is the engine, not a player. */
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
export async function sendCofdMail(opts: CofdMailOptions): Promise<void> {
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
