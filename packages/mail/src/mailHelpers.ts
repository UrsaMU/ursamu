import { dbojs } from "@ursamu/mush";
import { mailDb, MAIL_QUOTA, type IMail } from "./mailDbo.ts";

export { MAIL_QUOTA };

export const HR = "-".repeat(77);
export const PAD = (text: string, width: number) => text.padEnd(width).slice(0, width);

export const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}:${ss} ${d.getFullYear()}`;
};

/**
 * Return all mail in a player's inbox or trash.
 * Deduplicates across TO and CC queries.
 */
export async function getMyMail(
  playerId: string,
  folder: "inbox" | "trash" = "inbox",
): Promise<IMail[]> {
  const dbref = `#${playerId}`;
  const toMails = await mailDb.find({ to: { $in: [dbref] } });
  const ccMails = await mailDb.find({ cc: { $in: [dbref] } });
  const seen = new Set<string>();
  const all: IMail[] = [];
  for (const m of [...toMails, ...ccMails]) {
    if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
  }
  return all.filter(m => (m.folder ?? "inbox") === folder);
}

/** Count inbox messages for quota enforcement. */
export async function countPlayerMail(playerId: string): Promise<number> {
  return (await getMyMail(playerId, "inbox")).length;
}

/**
 * Resolve an array of "#<id>" dbrefs to a comma-separated name string.
 * Falls back to the raw ref on lookup failure.
 */
export async function resolveNames(ids: string[]): Promise<string> {
  const names: string[] = [];
  for (const ref of ids) {
    const obj = await dbojs.queryOne({ id: ref.replace("#", "") }).catch(() => null);
    const data = obj?.data as
      | { name?: string; moniker?: string }
      | undefined;
    names.push(data?.moniker ?? data?.name ?? ref);
  }
  return names.join(", ");
}

/** System-wide mail counts (admin stats / staff console). */
export type MailStats = {
  total: number;
  inbox: number;
  unread: number;
  trash: number;
  quota: number;
};

export async function getMailStats(): Promise<MailStats> {
  const all = await mailDb.find({});
  let inbox = 0;
  let unread = 0;
  let trash = 0;
  for (const m of all) {
    if (m.folder === "trash") {
      trash++;
      continue;
    }
    inbox++;
    if (!m.read) unread++;
  }
  return {
    total: all.length,
    inbox,
    unread,
    trash,
    quota: MAIL_QUOTA,
  };
}

/** Delete all messages whose `expiresAt` is set and in the past. */
export async function runExpirySweep(): Promise<void> {
  const now = Date.now();
  const all = await mailDb.find({});
  for (const m of all) {
    if (m.expiresAt && m.expiresAt < now) {
      await mailDb.delete({ id: m.id }).catch(e =>
        console.error("[mail] expiry sweep error:", e)
      );
    }
  }
}
