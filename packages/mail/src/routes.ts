import { mailDb, type IMail, MAIL_QUOTA } from "./mailDbo.ts";
import { dbojs, gameHooks } from "@ursamu/mush";
import { countPlayerMail } from "./mailHelpers.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

const sanitizeForRecipient = (m: IMail): Omit<IMail, "bcc"> => {
  const { bcc: _bcc, ...rest } = m;
  return rest;
};

/**
 * Mail REST route handler.
 *
 * GET    /api/v1/mail              — list inbox (or ?folder=trash)
 * GET    /api/v1/mail/sent         — messages sent by caller
 * GET    /api/v1/mail/:id          — single message (marks read)
 * POST   /api/v1/mail              — send a new message immediately
 * PATCH  /api/v1/mail/:id          — update folder or starred state
 * DELETE /api/v1/mail/:id          — move to trash (hard delete if already trash)
 */
export async function mailRouteHandler(req: Request, userId: string | null): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  const user = await dbojs.queryOne({ id: userId });
  if (!user) return json({ error: "Unauthorized" }, 401);
  const dbref = `#${userId}`;

  // GET /api/v1/mail/sent
  if (path === "/api/v1/mail/sent" && method === "GET") {
    const sent = (await mailDb.find({ from: dbref })).sort((a, b) => b.date - a.date);
    return json(sent);
  }

  // GET /api/v1/mail
  if (path === "/api/v1/mail" && method === "GET") {
    const folder = (url.searchParams.get("folder") ?? "inbox") as "inbox" | "trash";
    const all = await mailDb.find({});
    const seen = new Set<string>();
    const inbox = all
      .filter(m => {
        const isRecipient = m.to.includes(dbref) || (m.cc ?? []).includes(dbref);
        if (!isRecipient || seen.has(m.id)) return false;
        seen.add(m.id);
        return (m.folder ?? "inbox") === folder;
      })
      .sort((a, b) => b.date - a.date);
    return json(inbox.map(sanitizeForRecipient));
  }

  // POST /api/v1/mail
  if (path === "/api/v1/mail" && method === "POST") {
    let body: Partial<IMail>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { to, subject, message, cc, bcc } = body;
    if (!Array.isArray(to) || to.length === 0)      return json({ error: "'to' must be a non-empty array of dbrefs" }, 400);
    if (!subject || typeof subject !== "string" || !subject.trim()) return json({ error: "'subject' is required" }, 400);
    if (!message || typeof message !== "string" || !message.trim()) return json({ error: "'message' is required" }, 400);

    const filteredTo: string[] = [];
    for (const ref of to) {
      const id = ref.replace("#", "");
      if (await countPlayerMail(id) >= MAIL_QUOTA) continue;
      filteredTo.push(ref);
    }
    if (filteredTo.length === 0) return json({ error: "All recipients' mailboxes are full" }, 422);

    const newMail: IMail = {
      id: crypto.randomUUID(), from: dbref, to: filteredTo,
      subject: subject.trim(), message: message.trim(),
      cc: cc ?? [], bcc: bcc ?? [], date: Date.now(), read: false, folder: "inbox",
    };
    await mailDb.create(newMail);

    for (const ref of [...filteredTo, ...(cc ?? [])]) {
      const id = ref.replace("#", "");
      if (id !== userId) {
        gameHooks.emit("mail:received", {
          to: id, from: userId,
          subject: newMail.subject,
          body: newMail.message ?? "",
        }).catch((e: unknown) => console.error("[mail] mail:received emit error:", e));
      }
    }

    return json({ id: newMail.id }, 201);
  }

  // Routes requiring a mail ID
  const idMatch = path.match(/^\/api\/v1\/mail\/([^/]+)$/);
  if (!idMatch) return json({ error: "Not found" }, 404);
  const mailId = idMatch[1];

  // GET /api/v1/mail/:id
  if (method === "GET") {
    const msg = await mailDb.findOne({ id: mailId });
    if (!msg) return json({ error: "Not found" }, 404);
    const isRecipient = msg.to.includes(dbref) || (msg.cc ?? []).includes(dbref);
    const isSender    = msg.from === dbref;
    if (!isRecipient && !isSender) return json({ error: "Forbidden" }, 403);
    if (isRecipient && !msg.read) {
      await mailDb.modify({ id: mailId }, "$set", { read: true } as Partial<IMail>);
      msg.read = true;
    }
    return json(isSender ? msg : sanitizeForRecipient(msg));
  }

  // PATCH /api/v1/mail/:id — update folder or starred
  if (method === "PATCH") {
    const msg = await mailDb.findOne({ id: mailId });
    if (!msg) return json({ error: "Not found" }, 404);
    const isRecipient = msg.to.includes(dbref) || (msg.cc ?? []).includes(dbref);
    if (!isRecipient) return json({ error: "Forbidden" }, 403);
    let body: { folder?: "inbox" | "trash"; starred?: boolean };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const update: Partial<IMail> = {};
    if (body.folder === "inbox" || body.folder === "trash") update.folder = body.folder;
    if (typeof body.starred === "boolean") update.starred = body.starred;
    if (Object.keys(update).length === 0) return json({ error: "Nothing to update" }, 400);
    await mailDb.modify({ id: mailId }, "$set", update);
    return json({ ok: true });
  }

  // DELETE /api/v1/mail/:id
  if (method === "DELETE") {
    const msg = await mailDb.findOne({ id: mailId });
    if (!msg) return json({ error: "Not found" }, 404);
    const isRecipient = msg.to.includes(dbref) || (msg.cc ?? []).includes(dbref);
    const isSender    = msg.from === dbref;
    if (!isRecipient && !isSender) return json({ error: "Forbidden" }, 403);
    // Soft delete to trash; hard delete if already trashed
    if (msg.folder === "trash") {
      await mailDb.delete({ id: mailId });
    } else {
      await mailDb.modify({ id: mailId }, "$set", { folder: "trash" } as Partial<IMail>);
    }
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
