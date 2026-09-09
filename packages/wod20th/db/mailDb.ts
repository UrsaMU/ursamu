// db/mailDb.ts -- Thin wrapper for sending @mail from native command code.
//
// `u.mail` only exists in sandbox scripts; native addCmd handlers go
// through the underlying DBO directly per the SDK docs.

import { DBO } from "@ursamu/ursamu";

export interface IMail {
  id: string;
  /** dbref-style sender id: "#<charId>" or "#<systemActor>". */
  from: string;
  /** dbref-style recipients. */
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  read: boolean;
  /** epoch ms. */
  date: number;
}

const db = new DBO<IMail>("mail");

export interface SendMailInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  read?: boolean;
  date?: number;
}

export async function sendMail(msg: SendMailInput): Promise<void> {
  const rec: IMail = {
    id: crypto.randomUUID(),
    from: msg.from,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    message: msg.message,
    read: msg.read ?? false,
    date: msg.date ?? Date.now(),
  };
  await db.create(rec);
}
