import type { IUrsamuSDK } from "@ursamu/mush";
import { mailDb, type IMail } from "./mailDbo.ts";
import { getMyMail, HR, PAD, formatDate, MAIL_QUOTA } from "./mailHelpers.ts";

/** Display the player's inbox or trash folder listing. */
export async function mailList(u: IUrsamuSDK, folder: "inbox" | "trash" = "inbox"): Promise<void> {
  const mails = (await getMyMail(u.me.id, folder)).sort((a, b) => a.date - b.date);
  const title = folder === "trash" ? " MAIL: Trash " : " MAIL: Inbox ";
  const hdrPad = Math.floor((77 - title.length) / 2);
  u.send("-".repeat(hdrPad) + title + "-".repeat(77 - hdrPad - title.length));

  if (mails.length === 0) {
    u.send("  No messages.");
  } else {
    for (let i = 0; i < mails.length; i++) {
      const m = mails[i];
      const fromId = m.from.replace("#", "");
      const fromObj = await u.util.target(u.me, fromId).catch(() => null);
      const fromName = fromObj?.name ?? "Unknown";
      const flags = `[${m.read ? "-" : "U"}${m.replied ? "R" : "-"}${m.forwarded ? "F" : "-"}${m.starred ? "S" : "-"}----]`;
      const charStr = `(${String((m.message ?? "").length).padStart(4)})`;
      const num = String(i + 1).padStart(3);
      u.send(`${flags} ${num} ${charStr}   From: ${PAD(fromName, 16)} Sub:  ${(m.subject ?? "(No Subject)").slice(0, 28)}`);
    }
  }

  u.send(HR);
  if (folder === "inbox") {
    const count = mails.length;
    const warn = count >= MAIL_QUOTA * 0.9 ? " %ch%cy[NEAR QUOTA]%cn" : "";
    u.send(`  ${count}/${MAIL_QUOTA} messages.${warn}`);
  }
}

/** Read a single message by 1-based index. Marks as read. */
export async function mailRead(u: IUrsamuSDK, subArgs: string, folder: "inbox" | "trash" = "inbox"): Promise<void> {
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, folder)).sort((a, b) => a.date - b.date);

  if (!num || num < 1 || num > mails.length) {
    u.send("%chMAIL:%cn Invalid message number.");
    return;
  }

  const m = mails[num - 1];
  if (m.id && !m.read) {
    await mailDb.modify({ id: m.id }, "$set", { read: true } as Partial<IMail>).catch(() => null);
  }

  const fromId = m.from.replace("#", "");
  const fromObj = await u.util.target(u.me, fromId).catch(() => null);
  const fromName = fromObj?.name ?? "Unknown";

  u.send(HR);
  u.send(`Message #: ${num}  Status: ${PAD(m.read ? "OLD" : "NEW", 10)}From: ${fromName}`);
  u.send(`Date/Time: ${PAD(formatDate(m.date), 28)}Size: ${(m.message ?? "").length} Bytes`);
  u.send(`Subject: ${m.subject}`);
  if (m.cc?.length) {
    const { resolveNames } = await import("./mailHelpers.ts");
    u.send(`CC: ${await resolveNames(m.cc)}`);
  }
  if (m.attachments?.length) u.send(`Attachments: ${m.attachments.join(", ")}`);
  u.send(HR);
  u.send(m.message || "(No body)");
  u.send(HR);
}

/** Move a message to trash (soft delete). Starred messages are protected. */
export async function mailTrash(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, "inbox")).sort((a, b) => a.date - b.date);

  if (!num || num < 1 || num > mails.length) {
    u.send("%chMAIL:%cn Invalid message number.");
    return;
  }

  const m = mails[num - 1];
  if (m.starred) {
    u.send(`%chMAIL:%cn Message ${num} is saved. Use '@mail/unsave ${num}' first.`);
    return;
  }

  await mailDb.modify({ id: m.id }, "$set", { folder: "trash" } as Partial<IMail>);
  u.send(`%chMAIL:%cn Message ${num} moved to trash. Use '@mail/restore ${num}' to recover it, or '@mail/purge' to delete permanently.`);
}

/** Restore a message from trash back to inbox. */
export async function mailRestore(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, "trash")).sort((a, b) => a.date - b.date);

  if (!num || num < 1 || num > mails.length) {
    u.send("%chMAIL:%cn Invalid message number (in trash).");
    return;
  }

  await mailDb.modify({ id: mails[num - 1].id }, "$set", { folder: "inbox" } as Partial<IMail>);
  u.send(`%chMAIL:%cn Message restored to inbox.`);
}

/** Permanently delete all messages in the player's trash. */
export async function mailPurge(u: IUrsamuSDK): Promise<void> {
  const trash = await getMyMail(u.me.id, "trash");
  if (trash.length === 0) {
    u.send("%chMAIL:%cn Your trash is empty.");
    return;
  }
  for (const m of trash) {
    await mailDb.delete({ id: m.id }).catch(() => null);
  }
  u.send(`%chMAIL:%cn ${trash.length} message${trash.length === 1 ? "" : "s"} permanently deleted.`);
}

/** Save (star) a message to protect it from deletion. */
export async function mailSave(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, "inbox")).sort((a, b) => a.date - b.date);
  if (!num || num < 1 || num > mails.length) { u.send("%chMAIL:%cn Invalid message number."); return; }
  await mailDb.modify({ id: mails[num - 1].id }, "$set", { starred: true } as Partial<IMail>);
  u.send(`%chMAIL:%cn Message ${num} saved — protected from deletion.`);
}

/** Remove the save protection from a message. */
export async function mailUnsave(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, "inbox")).sort((a, b) => a.date - b.date);
  if (!num || num < 1 || num > mails.length) { u.send("%chMAIL:%cn Invalid message number."); return; }
  await mailDb.modify({ id: mails[num - 1].id }, "$set", { starred: false } as Partial<IMail>);
  u.send(`%chMAIL:%cn Message ${num} unsaved — it can now be deleted.`);
}
