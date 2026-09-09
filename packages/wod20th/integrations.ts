// Soft integrations with sister plugins (channel, mail).
//
// Each helper attempts the integration and swallows any error silently:
// wod20th must keep working even when the optional plugin is absent.
//
// - notifyChargenChannel: broadcasts to a "chargen" channel if it exists.
//                         (Falls back to the bbs "Applications" board if
//                          chargen channel is missing but bbs is loaded.)
// - sendChargenMail:      delivers an in-game mail via the mail.messages DBO.

import { DBO, send, dbojs } from "@ursamu/ursamu";

// -- Channel integration --------------------------------------------------

interface IChanRecord {
  id: string;
  name: string;
  header?: string;
  lock?: string;
}

const _chans = new DBO<IChanRecord>("server.chans");

/**
 * Broadcast a one-line note to the "chargen" channel (or "applications" if
 * that's what staff named it). Silent no-op if neither channel exists.
 */
export async function notifyChargenChannel(text: string): Promise<void> {
  try {
    let chan = await _chans.queryOne({ name: "chargen" });
    if (!chan) chan = await _chans.queryOne({ name: "applications" });
    if (!chan) return;
    const header = chan.header ?? "%ch[Chargen]%cn";
    send([chan.name], `${header} ${text}`, {});
  } catch (_e) {
    // channel plugin not loaded or DBO unavailable -- silent fallback
  }
}

// -- Mail integration -----------------------------------------------------

interface IMailRecord {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  date: number;
  read: boolean;
  folder?: "inbox" | "trash";
}

const _mail = new DBO<IMailRecord>("mail.messages");

/**
 * Send a piece of in-game mail to a player. Returns true on success.
 * Soft-fails (returns false) if the mail plugin isn't installed.
 *
 * `fromId` / `toId` are bare object ids (no '#'). The mail plugin stores
 * them as "#<id>" dbrefs.
 */
export async function sendChargenMail(
  fromId: string,
  toId: string,
  subject: string,
  body: string,
): Promise<boolean> {
  try {
    // Verify sender and recipient both exist before writing
    const sender = await dbojs.queryOne({ id: fromId });
    const recip  = await dbojs.queryOne({ id: toId });
    if (!sender || !recip) return false;

    await _mail.create({
      id: crypto.randomUUID(),
      from: `#${fromId}`,
      to: [`#${toId}`],
      subject,
      message: body,
      date: Date.now(),
      read: false,
      folder: "inbox",
    });
    return true;
  } catch (_e) {
    return false;
  }
}
