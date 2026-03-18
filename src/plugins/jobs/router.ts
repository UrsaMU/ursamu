import { jobs, getNextJobNumber } from "./db.ts";
import type { IJob, IJobComment } from "../../@types/IJob.ts";
import { dbojs } from "../../services/Database/index.ts";
import { jobHooks } from "./hooks.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = player.flags || "";
  return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
}

function stripStaffComments(job: IJob): IJob {
  return { ...job, comments: job.comments.filter(c => !c.staffOnly) };
}

async function resolveJob(idParam: string): Promise<IJob | null> {
  const num = parseInt(idParam, 10);
  if (!isNaN(num)) {
    const result = await jobs.queryOne({ number: num });
    return result || null;
  }
  const result = await jobs.queryOne({ id: idParam });
  return result || null;
}

function makeCommentId(): string {
  return `jc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function jobsRouteHandler(req: Request, userId: string | null): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // ── GET /api/v1/jobs/stats ───────────────────────────────────────────────
  if (path === "/api/v1/jobs/stats" && method === "GET") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    const all = await jobs.find({});
    const byStatus: Record<string, number>   = { new: 0, open: 0, pending: 0, "in-progress": 0, resolved: 0, closed: 0 };
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = { low: 0, normal: 0, high: 0, critical: 0 };
    let openAssigned = 0;
    let openUnassigned = 0;

    for (const j of all) {
      byStatus[j.status]   = (byStatus[j.status]   || 0) + 1;
      byCategory[j.category] = (byCategory[j.category] || 0) + 1;
      byPriority[j.priority] = (byPriority[j.priority] || 0) + 1;
      if (j.status !== "closed" && j.status !== "resolved") {
        j.assignedTo ? openAssigned++ : openUnassigned++;
      }
    }

    return jsonResponse({ total: all.length, byStatus, byCategory, byPriority, openAssigned, openUnassigned });
  }

  // ── GET /api/v1/jobs ─────────────────────────────────────────────────────
  if (path === "/api/v1/jobs" && method === "GET") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);

    const params     = url.searchParams;
    const filterStatus   = params.get("status")      || null;
    const filterCategory = params.get("category")    || null;
    const filterPriority = params.get("priority")    || null;
    const filterAssigned = params.get("assignedTo")  || null;
    const filterSub      = params.get("submittedBy") || null;
    const limit  = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
    const offset = Math.max(parseInt(params.get("offset") || "0",  10), 0);

    let all = await jobs.find({});

    // visibility filter
    all = all.filter(j => {
      if (staff) return true;
      if (j.staffOnly) return false;
      return j.submittedBy === userId;
    });

    // param filters
    if (filterStatus)   all = all.filter(j => j.status      === filterStatus);
    if (filterCategory) all = all.filter(j => j.category    === filterCategory);
    if (filterPriority) all = all.filter(j => j.priority    === filterPriority);
    if (filterAssigned) all = all.filter(j => j.assignedTo  === filterAssigned);
    if (filterSub)      all = all.filter(j => j.submittedBy === filterSub);

    all.sort((a, b) => b.number - a.number);
    const page = all.slice(offset, offset + limit);

    const result = staff ? page : page.map(stripStaffComments);
    return jsonResponse(result);
  }

  // ── POST /api/v1/jobs ────────────────────────────────────────────────────
  if (path === "/api/v1/jobs" && method === "POST") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const title       = typeof body.title       === "string" ? body.title.trim()       : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category    = typeof body.category    === "string" ? body.category.toLowerCase() : "request";
    const priority    = typeof body.priority    === "string" ? body.priority.toLowerCase() : "normal";
    const jobStaffOnly = body.staffOnly === true;

    if (!title || !description) {
      return jsonResponse({ error: "title and description are required" }, 400);
    }
    if (jobStaffOnly && !staff) {
      return jsonResponse({ error: "Forbidden: staffOnly requires staff privileges" }, 403);
    }

    const player = await dbojs.queryOne({ id: userId }) as import("../../@types/IDBObj.ts").IDBOBJ | false;
    const submitterName = (player && player.data?.name) || userId;

    const num = await getNextJobNumber();
    const now = Date.now();
    const job: IJob = {
      id:            `job-${num}`,
      number:        num,
      title,
      category,
      priority:      (priority as IJob["priority"]) || "normal",
      status:        "new",
      submittedBy:   userId,
      submitterName,
      description,
      comments:      [],
      createdAt:     now,
      updatedAt:     now,
      staffOnly:     jobStaffOnly,
    };

    await jobs.create(job);
    await jobHooks.emit("job:created", job);
    return jsonResponse(job, 201);
  }

  // ── job by id/number sub-routes ──────────────────────────────────────────
  const jobMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)(\/comment)?$/);
  if (jobMatch) {
    const idParam    = jobMatch[1];
    const subRoute   = jobMatch[2] || "";

    // ── GET /api/v1/jobs/:id ───────────────────────────────────────────────
    if (!subRoute && method === "GET") {
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const staff = await isStaffUser(userId);

      const job = await resolveJob(idParam);
      if (!job) return jsonResponse({ error: "Not found" }, 404);

      if (job.staffOnly && !staff) return jsonResponse({ error: "Forbidden" }, 403);
      if (!staff && job.submittedBy !== userId) return jsonResponse({ error: "Forbidden" }, 403);

      return jsonResponse(staff ? job : stripStaffComments(job));
    }

    // ── PATCH /api/v1/jobs/:id ─────────────────────────────────────────────
    if (!subRoute && method === "PATCH") {
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const staff = await isStaffUser(userId);
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const job = await resolveJob(idParam);
      if (!job) return jsonResponse({ error: "Not found" }, 404);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const ALLOWED = ["status", "priority", "assignedTo", "title", "description"];
      const update: Partial<IJob> = { updatedAt: Date.now() };

      for (const field of ALLOWED) {
        if (field in body) {
          (update as Record<string, unknown>)[field] = body[field];
        }
      }

      const updated: IJob = { ...job, ...update };
      await jobs.update({}, updated);

      // Fire granular hooks based on what actually changed
      if ("status" in update && update.status !== job.status) {
        if (update.status === "closed") {
          await jobHooks.emit("job:closed", updated);
        } else if (update.status === "resolved") {
          await jobHooks.emit("job:resolved", updated);
        } else if ((job.status === "closed" || job.status === "resolved") && update.status === "open") {
          await jobHooks.emit("job:reopened", updated);
        } else {
          await jobHooks.emit("job:status-changed", updated, job.status);
        }
      }
      if ("priority" in update && update.priority !== job.priority) {
        await jobHooks.emit("job:priority-changed", updated, job.priority);
      }
      if ("assignedTo" in update && update.assignedTo !== job.assignedTo) {
        await jobHooks.emit("job:assigned", updated);
      }

      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/jobs/:id ────────────────────────────────────────────
    if (!subRoute && method === "DELETE") {
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const staff = await isStaffUser(userId);
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const job = await resolveJob(idParam);
      if (!job) return jsonResponse({ error: "Not found" }, 404);

      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:deleted", job);
      return jsonResponse({ deleted: true });
    }

    // ── POST /api/v1/jobs/:id/comment ──────────────────────────────────────
    if (subRoute === "/comment" && method === "POST") {
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const staff = await isStaffUser(userId);

      const job = await resolveJob(idParam);
      if (!job) return jsonResponse({ error: "Not found" }, 404);

      if (job.staffOnly && !staff) return jsonResponse({ error: "Forbidden" }, 403);
      if (!staff && job.submittedBy !== userId) return jsonResponse({ error: "Forbidden" }, 403);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const text      = typeof body.text === "string" ? body.text.trim() : "";
      const staffOnly = body.staffOnly === true;

      if (!text) return jsonResponse({ error: "text is required" }, 400);
      if (staffOnly && !staff) return jsonResponse({ error: "Forbidden: staffOnly requires staff privileges" }, 403);

      const player = await dbojs.queryOne({ id: userId }) as import("../../@types/IDBObj.ts").IDBOBJ | false;
      const authorName = (player && player.data?.name) || userId;

      const comment: IJobComment = {
        id:         makeCommentId(),
        authorId:   userId,
        authorName,
        text,
        timestamp:  Date.now(),
        staffOnly,
      };

      const updated: IJob = { ...job, comments: [...job.comments, comment], updatedAt: Date.now() };
      await jobs.update({}, updated);
      await jobHooks.emit("job:commented", updated, comment);
      return jsonResponse(comment, 201);
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
