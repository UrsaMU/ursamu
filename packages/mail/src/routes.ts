/**
 * Mail REST route handler.
 *
 * GET    /api/v1/mail              — list inbox (?folder=trash)
 * GET    /api/v1/mail/sent         — messages sent by caller
 * GET    /api/v1/mail/stats        — system stats (staff)
 * GET    /api/v1/mail/all          — system list (staff)
 * GET    /api/v1/mail/:id          — single message
 * POST   /api/v1/mail              — send
 * PATCH  /api/v1/mail/:id          — folder / starred
 * DELETE /api/v1/mail/:id          — trash or purge
 */

import { mailDb, type IMail, MAIL_QUOTA } from "./mailDbo.ts";
import { dbojs, gameHooks } from "@ursamu/mush";
import {
  countPlayerMail,
  getMailStats,
} from "./mailHelpers.ts";
import { isStaffFlags } from "./staff-auth.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });

const sanitizeForRecipient = (
  m: IMail,
): Omit<IMail, "bcc"> => {
  const { bcc: _bcc, ...rest } = m;
  return rest;
};

function partyOf(
  m: IMail,
  dbref: string,
): { recipient: boolean; sender: boolean } {
  return {
    recipient: m.to.includes(dbref) ||
      (m.cc ?? []).includes(dbref),
    sender: m.from === dbref,
  };
}

export async function mailRouteHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const user = await dbojs.queryOne({ id: userId });
  if (!user) return json({ error: "Unauthorized" }, 401);
  const dbref = `#${userId}`;
  const staff = isStaffFlags(user.flags);

  // GET /api/v1/mail/stats
  if (path === "/api/v1/mail/stats" && method === "GET") {
    if (!staff) return json({ error: "Forbidden" }, 403);
    return json(await getMailStats());
  }

  // GET /api/v1/mail/all — staff system browser
  if (path === "/api/v1/mail/all" && method === "GET") {
    if (!staff) return json({ error: "Forbidden" }, 403);
    return json(await listAllMail(url));
  }

  // GET /api/v1/mail/sent
  if (path === "/api/v1/mail/sent" && method === "GET") {
    const sent = (await mailDb.find({ from: dbref }))
      .sort((a, b) => b.date - a.date);
    return json(sent);
  }

  // GET /api/v1/mail
  if (path === "/api/v1/mail" && method === "GET") {
    const folder = (url.searchParams.get("folder") ?? "inbox") as
      | "inbox"
      | "trash";
    const all = await mailDb.find({});
    const seen = new Set<string>();
    const inbox = all
      .filter((m) => {
        const isRecipient = m.to.includes(dbref) ||
          (m.cc ?? []).includes(dbref);
        if (!isRecipient || seen.has(m.id)) return false;
        seen.add(m.id);
        return (m.folder ?? "inbox") === folder;
      })
      .sort((a, b) => b.date - a.date);
    return json(inbox.map(sanitizeForRecipient));
  }

  // POST /api/v1/mail
  if (path === "/api/v1/mail" && method === "POST") {
    return await postMail(req, userId, dbref);
  }

  const idMatch = path.match(/^\/api\/v1\/mail\/([^/]+)$/);
  if (!idMatch) return json({ error: "Not found" }, 404);
  const mailId = idMatch[1];
  if (mailId === "stats" || mailId === "all" || mailId === "sent") {
    return json({ error: "Not found" }, 404);
  }

  if (method === "GET") {
    return await getOne(mailId, dbref, staff);
  }
  if (method === "PATCH") {
    return await patchOne(req, mailId, dbref, staff);
  }
  if (method === "DELETE") {
    return await deleteOne(mailId, dbref, staff);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function listAllMail(url: URL): Promise<IMail[]> {
  const folder = (url.searchParams.get("folder") ?? "any")
    .toLowerCase();
  const unreadOnly = url.searchParams.get("unread") === "1" ||
    url.searchParams.get("unread") === "true";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "200", 10) ||
      200, 1),
    500,
  );

  let list = await mailDb.find({});
  if (folder === "inbox" || folder === "trash") {
    list = list.filter((m) => (m.folder ?? "inbox") === folder);
  }
  if (unreadOnly) {
    list = list.filter((m) =>
      !m.read && (m.folder ?? "inbox") !== "trash"
    );
  }
  if (q) {
    list = list.filter((m) => {
      const hay = [
        m.subject,
        m.message,
        m.from,
        ...(m.to ?? []),
        ...(m.cc ?? []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  return list.sort((a, b) => b.date - a.date).slice(0, limit);
}

async function postMail(
  req: Request,
  userId: string,
  dbref: string,
): Promise<Response> {
  let body: Partial<IMail>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { to, subject, message, cc, bcc } = body;
  if (!Array.isArray(to) || to.length === 0) {
    return json({ error: "'to' must be a non-empty array" }, 400);
  }
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return json({ error: "'subject' is required" }, 400);
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return json({ error: "'message' is required" }, 400);
  }

  const toRefs = to.map((r) => {
    const s = String(r).trim();
    return s.startsWith("#") ? s : `#${s}`;
  });
  const okTo: string[] = [];
  for (const ref of toRefs) {
    const id = ref.replace(/^#/, "");
    if (await countPlayerMail(id) >= MAIL_QUOTA) continue;
    okTo.push(ref);
  }
  if (okTo.length === 0) {
    return json(
      { error: "All recipients' mailboxes are full" },
      422,
    );
  }

  const ccRefs = (cc ?? []).map((r) => {
    const s = String(r).trim();
    return s.startsWith("#") ? s : `#${s}`;
  });
  const bccRefs = (bcc ?? []).map((r) => {
    const s = String(r).trim();
    return s.startsWith("#") ? s : `#${s}`;
  });

  const newMail: IMail = {
    id: crypto.randomUUID(),
    from: dbref,
    to: okTo,
    subject: subject.trim(),
    message: message.trim(),
    cc: ccRefs,
    bcc: bccRefs,
    date: Date.now(),
    read: false,
    folder: "inbox",
  };
  await mailDb.create(newMail);

  for (const ref of [...okTo, ...ccRefs]) {
    const id = ref.replace(/^#/, "");
    if (id !== userId) {
      gameHooks.emit("mail:received", {
        to: id,
        from: userId,
        subject: newMail.subject,
        body: newMail.message ?? "",
      }).catch((e: unknown) =>
        console.error("[mail] mail:received emit error:", e)
      );
    }
  }

  return json({ id: newMail.id }, 201);
}

async function getOne(
  mailId: string,
  dbref: string,
  staff: boolean,
): Promise<Response> {
  const msg = await mailDb.findOne({ id: mailId });
  if (!msg) return json({ error: "Not found" }, 404);
  const { recipient, sender } = partyOf(msg, dbref);
  if (!recipient && !sender && !staff) {
    return json({ error: "Forbidden" }, 403);
  }
  if (recipient && !msg.read) {
    await mailDb.modify(
      { id: mailId },
      "$set",
      { read: true } as Partial<IMail>,
    );
    msg.read = true;
  }
  if (sender || staff) return json(msg);
  return json(sanitizeForRecipient(msg));
}

async function patchOne(
  req: Request,
  mailId: string,
  dbref: string,
  staff: boolean,
): Promise<Response> {
  const msg = await mailDb.findOne({ id: mailId });
  if (!msg) return json({ error: "Not found" }, 404);
  const { recipient } = partyOf(msg, dbref);
  if (!recipient && !staff) {
    return json({ error: "Forbidden" }, 403);
  }
  let body: { folder?: "inbox" | "trash"; starred?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const update: Partial<IMail> = {};
  if (body.folder === "inbox" || body.folder === "trash") {
    update.folder = body.folder;
  }
  if (typeof body.starred === "boolean") update.starred = body.starred;
  if (Object.keys(update).length === 0) {
    return json({ error: "Nothing to update" }, 400);
  }
  await mailDb.modify({ id: mailId }, "$set", update);
  return json({ ok: true });
}

async function deleteOne(
  mailId: string,
  dbref: string,
  staff: boolean,
): Promise<Response> {
  const msg = await mailDb.findOne({ id: mailId });
  if (!msg) return json({ error: "Not found" }, 404);
  const { recipient, sender } = partyOf(msg, dbref);
  if (!recipient && !sender && !staff) {
    return json({ error: "Forbidden" }, 403);
  }
  if (msg.folder === "trash") {
    await mailDb.delete({ id: mailId });
  } else {
    await mailDb.modify(
      { id: mailId },
      "$set",
      { folder: "trash" } as Partial<IMail>,
    );
  }
  return json({ ok: true });
}
