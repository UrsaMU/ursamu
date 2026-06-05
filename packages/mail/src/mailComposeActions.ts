import type { IUrsamuSDK } from "@ursamu/mush";
import { gameHooks } from "@ursamu/mush";
import { mailDb, type IMail, MAIL_QUOTA } from "./mailDbo.ts";
import { getMyMail, countPlayerMail, resolveNames, HR } from "./mailHelpers.ts";

/** Start a new draft: @mail <target>=<subject> */
export async function mailDraftNew(u: IUrsamuSDK, rawinput: string): Promise<void> {
  if (u.me.state.tempMail) {
    u.send("%chMAIL:%cn You already have a draft in progress. Use '@mail/abort' to discard it.");
    return;
  }
  const eqIdx = rawinput.indexOf("=");
  const targetName = rawinput.slice(0, eqIdx).trim();
  const subject    = rawinput.slice(eqIdx + 1).trim();
  const target = await u.util.target(u.me, targetName, true);
  if (!target) { u.send(`%chMAIL:%cn Target '${targetName}' not found.`); return; }

  const draft: Partial<IMail> = {
    id: crypto.randomUUID(), from: `#${u.me.id}`, to: [`#${target.id}`],
    subject: subject || "(No Subject)", message: "", date: Date.now(), read: false,
  };
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Draft started to %ch${target.name}%cn. Subject: ${draft.subject}`);
  u.send("Use '-<text>' to add lines. Use '@mail/send' to send or '@mail/abort' to cancel.");
}

/** Append a line to the active draft body. Used by the '-' command. */
export async function mailAppend(u: IUrsamuSDK, text: string): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) {
    u.send("%chMAIL:%cn No draft in progress. Use '@mail <target>=<subject>' to start one.");
    return;
  }
  draft.message = draft.message ? `${draft.message}\n${text}` : text;
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Line added.`);
}

/** Set the subject on the active draft. */
export async function mailSubject(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) { u.send("%chMAIL:%cn No draft in progress."); return; }
  const subject = subArgs.trim();
  if (!subject) { u.send("%chMAIL:%cn Usage: @mail/subject <text>"); return; }
  draft.subject = subject;
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Subject set: ${subject}`);
}

/** Add a CC recipient to the active draft. */
export async function mailCC(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) { u.send("%chMAIL:%cn No draft in progress."); return; }
  const target = await u.util.target(u.me, subArgs.trim(), true);
  if (!target) { u.send(`%chMAIL:%cn Target '${subArgs.trim()}' not found.`); return; }
  draft.cc ??= [];
  const ref = `#${target.id}`;
  if (!draft.cc.includes(ref)) draft.cc.push(ref);
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Added ${target.name} to CC.`);
}

/** Add a BCC recipient to the active draft. */
export async function mailBCC(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) { u.send("%chMAIL:%cn No draft in progress."); return; }
  const target = await u.util.target(u.me, subArgs.trim(), true);
  if (!target) { u.send(`%chMAIL:%cn Target '${subArgs.trim()}' not found.`); return; }
  draft.bcc ??= [];
  const ref = `#${target.id}`;
  if (!draft.bcc.includes(ref)) draft.bcc.push(ref);
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Added ${target.name} to BCC.`);
}

/** Attach a game object dbref to the active draft. */
export async function mailAttach(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) { u.send("%chMAIL:%cn No draft in progress."); return; }
  const target = await u.util.target(u.me, subArgs.trim(), true);
  if (!target) { u.send(`%chMAIL:%cn Target '${subArgs.trim()}' not found.`); return; }
  draft.attachments ??= [];
  const ref = `#${target.id}`;
  if (!draft.attachments.includes(ref)) draft.attachments.push(ref);
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  u.send(`%chMAIL:%cn Attached ${target.name} (${ref}) to draft.`);
}

/** Preview the active draft without sending. */
export async function mailProof(u: IUrsamuSDK): Promise<void> {
  const m = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!m) { u.send("%chMAIL:%cn No draft in progress."); return; }
  u.send(`\n%chDRAFT PREVIEW%cn`);
  u.send(`From:    ${u.me.name ?? "Unknown"} (#${u.me.id})`);
  u.send(`To:      ${await resolveNames(m.to ?? [])}`);
  if (m.cc?.length)          u.send(`CC:      ${await resolveNames(m.cc)}`);
  if (m.bcc?.length)         u.send(`BCC:     ${await resolveNames(m.bcc)}`);
  if (m.attachments?.length) u.send(`Attach:  ${m.attachments.join(", ")}`);
  u.send(`Subject: ${m.subject}`);
  u.send(HR);
  u.send(m.message || "(No Body)");
  u.send("");
}

/** Discard the active draft. */
export async function mailAbort(u: IUrsamuSDK): Promise<void> {
  if (!u.me.state.tempMail) { u.send("%chMAIL:%cn No draft in progress."); return; }
  await u.db.modify(u.me.id, "$unset", { "data.tempMail": 1 });
  u.send("%chMAIL:%cn Draft discarded.");
}

/** Send the active draft. Enforces quota; emits mail:received for each recipient. */
export async function mailSend(u: IUrsamuSDK): Promise<void> {
  const draft = u.me.state.tempMail as Partial<IMail> | undefined;
  if (!draft) { u.send("%chMAIL:%cn No draft in progress."); return; }
  if (!draft.message?.trim()) {
    u.send("%chMAIL:%cn Cannot send a message with no body. Use '-<text>' to add content.");
    return;
  }

  // Quota check — skip recipients whose inbox is full
  const filteredTo: string[] = [];
  for (const ref of (draft.to ?? [])) {
    const id = ref.replace("#", "");
    const count = await countPlayerMail(id);
    if (count >= MAIL_QUOTA) {
      const obj = await u.util.target(u.me, id, true).catch(() => null);
      u.send(`%chMAIL:%cn Skipping ${obj?.name ?? ref} — mailbox full (${MAIL_QUOTA} messages).`);
    } else {
      filteredTo.push(ref);
    }
  }

  if (filteredTo.length === 0) {
    u.send("%chMAIL:%cn All recipients' mailboxes are full. Message not sent.");
    return;
  }

  const newMail: IMail = {
    ...(draft as IMail),
    id: crypto.randomUUID(),
    to: filteredTo,
    date: Date.now(),
    folder: "inbox",
  };

  try {
    await mailDb.create(newMail);
  } catch (e: unknown) {
    u.send(`%chMAIL:%cn Failed to send: ${e}`);
    return;
  }

  u.send("%chMAIL:%cn Message sent.");

  // Notify connected recipients and emit event
  const allTo = [...filteredTo, ...(draft.cc ?? [])];
  for (const ref of allTo) {
    const id = ref.replace("#", "");
    if (id !== u.me.id) {
      u.send(`%chMAIL:%cn You have a new message from ${u.me.name ?? "Unknown"}.`, id);
      gameHooks.emit("mail:received", {
        to: id, from: u.me.id,
        subject: newMail.subject, body: newMail.message ?? "",
      }).catch((e: unknown) => console.error("[mail] mail:received emit error:", e));
    }
  }

  await u.db.modify(u.me.id, "$unset", { "data.tempMail": 1 });
}

/** Start a reply draft to a message. */
export async function mailReply(u: IUrsamuSDK, subArgs: string, replyAll = false): Promise<void> {
  if (u.me.state.tempMail) {
    u.send("%chMAIL:%cn Draft in progress. Use '@mail/abort' to discard it first.");
    return;
  }
  const num = parseInt(subArgs.trim() || "");
  const mails = (await getMyMail(u.me.id, "inbox")).sort((a, b) => a.date - b.date);
  if (!num || num < 1 || num > mails.length) {
    u.send(`%chMAIL:%cn Usage: @mail/${replyAll ? "replyall" : "reply"} <message number>`);
    return;
  }

  const orig = mails[num - 1];
  const toList = replyAll
    ? [...new Set([orig.from, ...orig.to].filter(r => r !== `#${u.me.id}`))]
    : [orig.from];
  const subject = orig.subject.startsWith("Re: ") ? orig.subject : `Re: ${orig.subject}`;

  const draft: Partial<IMail> = {
    id: crypto.randomUUID(), from: `#${u.me.id}`, to: toList,
    subject, message: "", date: Date.now(), read: false,
  };
  await u.db.modify(u.me.id, "$set", { "data.tempMail": draft });
  if (orig.id) {
    await mailDb.modify({ id: orig.id }, "$set", { replied: true } as Partial<IMail>).catch(() => null);
  }
  const label = replyAll ? `Replying to all (${toList.length} recipients)` : `Replying to "${orig.subject}"`;
  u.send(`%chMAIL:%cn ${label}. Use '-<text>' to add lines, '@mail/send' to send.`);
}

/** Forward a message to a new target. */
export async function mailForward(u: IUrsamuSDK, subArgs: string): Promise<void> {
  const eqIdx = subArgs.indexOf("=");
  if (eqIdx === -1) { u.send("%chMAIL:%cn Usage: @mail/forward <message number>=<target>"); return; }
  const num = parseInt(subArgs.slice(0, eqIdx));
  const targetName = subArgs.slice(eqIdx + 1).trim();

  const mails = (await getMyMail(u.me.id, "inbox")).sort((a, b) => a.date - b.date);
  if (!num || num < 1 || num > mails.length) { u.send("%chMAIL:%cn Invalid message number."); return; }

  const target = await u.util.target(u.me, targetName, true);
  if (!target) { u.send(`%chMAIL:%cn Target '${targetName}' not found.`); return; }

  const orig = mails[num - 1];
  const fwd: IMail = {
    id: crypto.randomUUID(), from: `#${u.me.id}`, to: [`#${target.id}`],
    subject: orig.subject.startsWith("Fwd: ") ? orig.subject : `Fwd: ${orig.subject}`,
    message: `---------- Forwarded Message ----------\n${orig.message}`,
    date: Date.now(), read: false, folder: "inbox",
  };

  await mailDb.create(fwd);
  if (orig.id) {
    await mailDb.modify({ id: orig.id }, "$set", { forwarded: true } as Partial<IMail>).catch(() => null);
  }
  u.send(`%chMAIL:%cn Message forwarded to ${target.name}.`);
  u.send(`%chMAIL:%cn You have a forwarded message from ${u.me.name ?? "Unknown"}.`, target.id);
}
