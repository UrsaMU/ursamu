import { mail } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import { getNextId } from "../utils/getNextId.ts";
import type { IMail } from "../@types/IMail.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export const mailHandler = async (req: Request, userId: string): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  const user = await Obj.get(userId);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const dbref = user.dbref; // "#<id>"

  // GET /api/v1/mail/sent — messages sent by the current user
  if (path === "/api/v1/mail/sent" && req.method === "GET") {
    const sent = await mail.query({ from: dbref });
    sent.sort((a, b) => b.date - a.date);
    return json(sent.map(sanitizeForSender));
  }

  // GET /api/v1/mail — inbox (messages addressed to the current user)
  if (path === "/api/v1/mail" && req.method === "GET") {
    const all = await mail.query({});
    const seen = new Set<string | number>();
    const inbox = all
      .filter((m) => {
        if (!m.to.includes(dbref) && !(m.cc ?? []).includes(dbref)) return false;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => b.date - a.date);
    return json(inbox.map(sanitizeForRecipient));
  }

  // POST /api/v1/mail — send a new message
  if (path === "/api/v1/mail" && req.method === "POST") {
    let body: Partial<IMail>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { to, subject, message, cc, bcc } = body;

    if (!to || !Array.isArray(to) || to.length === 0) {
      return json({ error: "Field 'to' must be a non-empty array of dbrefs" }, 400);
    }
    const MAX_RECIPIENTS = 50;
    const totalRecipients = to.length + (Array.isArray(cc) ? cc.length : 0) + (Array.isArray(bcc) ? bcc.length : 0);
    if (totalRecipients > MAX_RECIPIENTS) {
      return json({ error: `Total recipients (to + cc + bcc) cannot exceed ${MAX_RECIPIENTS}` }, 400);
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return json({ error: "Field 'subject' is required" }, 400);
    }
    if (subject.length > 200) {
      return json({ error: "Subject exceeds 200 characters" }, 400);
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return json({ error: "Field 'message' is required" }, 400);
    }
    if (message.length > 10000) {
      return json({ error: "Message exceeds 10,000 characters" }, 400);
    }

    const id = await getNextId("mail");
    const newMail: IMail = {
      id,
      from: dbref,
      to,
      subject: subject.trim(),
      message: message.trim(),
      cc: cc ?? [],
      bcc: bcc ?? [],
      date: Date.now(),
      read: false,
    };

    await mail.create(newMail);
    return json({ id }, 201);
  }

  // Routes that require a mail ID
  const idMatch = path.match(/^\/api\/v1\/mail\/([^/]+)$/);
  if (idMatch) {
    const mailId = idMatch[1];

    // GET /api/v1/mail/:id — read a single message (marks as read)
    if (req.method === "GET") {
      const msg = await mail.queryOne({ id: mailId });
      if (!msg) return json({ error: "Not found" }, 404);

      const isRecipient = msg.to.includes(dbref) || (msg.cc ?? []).includes(dbref);
      const isSender = msg.from === dbref;
      if (!isRecipient && !isSender) return json({ error: "Forbidden" }, 403);

      // Mark as read for recipients
      if (isRecipient && !msg.read) {
        await mail.modify({ id: mailId }, "$set", { read: true } as Partial<IMail>);
        msg.read = true;
      }

      // Strip BCC from response unless the caller is the sender
      return json(isSender ? msg : sanitizeForRecipient(msg));
    }

    // DELETE /api/v1/mail/:id — delete a message
    if (req.method === "DELETE") {
      const msg = await mail.queryOne({ id: mailId });
      if (!msg) return json({ error: "Not found" }, 404);

      const isRecipient = msg.to.includes(dbref) || (msg.cc ?? []).includes(dbref);
      const isSender = msg.from === dbref;
      if (!isRecipient && !isSender) return json({ error: "Forbidden" }, 403);

      await mail.delete({ id: mailId });
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, 404);
};

// Strip BCC from messages shown to recipients
const sanitizeForRecipient = (m: IMail): Omit<IMail, "bcc"> => {
  const { bcc: _bcc, ...rest } = m;
  return rest;
};

const sanitizeForSender = (m: IMail) => m;
