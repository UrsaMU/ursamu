/** Best-effort system mail via @ursamu/mail (optional peer). */
import type { IMail } from "@ursamu/mail";
import { mailDb } from "@ursamu/mail";

const SYSTEM = "#0";

export async function sendSprawlMail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const now = Date.now();
  const mail: IMail = {
    id: `mail-sprawl-${now}-${Math.floor(Math.random() * 1e6)}`,
    from: SYSTEM,
    to: [opts.to.replace(/^#/, "")],
    subject: opts.subject,
    message: opts.body,
    date: now,
    read: false,
    folder: "inbox",
  };
  try {
    await mailDb.create(mail);
  } catch (e: unknown) {
    console.error("[sprawl] mail delivery failed:", e);
  }
}
