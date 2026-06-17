// ─── REST API: /api/v1/jobs ───────────────────────────────────────────────────

import { dbojs } from "@ursamu/mush";
import { jobs, getNextJobNumber } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { IJob, IJobComment } from "./types.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Convenience helper — wraps `data` in a JSON response with `status` (default 200). */
function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/**
 * Returns true when `userId` corresponds to a player with an admin, wizard, or
 * superuser flag. Uses a `Set` split on the stored flag string to prevent
 * substring bypass attacks (e.g. `"notadmin"` must not match `"admin"`).
 */
async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  // Split flag string into a Set — prevents substring bypass
  const flagSet = new Set((player.flags || "").split(" ").filter(Boolean));
  return flagSet.has("admin") || flagSet.has("wizard") || flagSet.has("superuser");
}

/**
 * Returns a shallow copy of `job` with all `staffOnly` comments removed,
 * safe to send in REST responses to non-staff callers.
 */
function stripStaffComments(job: IJob): IJob {
  return { ...job, comments: job.comments.filter((c) => !c.staffOnly) };
}

/**
 * Resolves a job by its `idParam` string, which may be either a sequential
 * job number (e.g. `"42"`) or a full UUID string (e.g. `"job-42"`).
 * Returns `null` if no matching active job is found.
 */
async function resolveJob(idParam: string): Promise<IJob | null> {
  const num = parseInt(idParam, 10);
  if (!isNaN(num)) return (await jobs.queryOne({ number: num })) || null;
  return (await jobs.queryOne({ id: idParam })) || null;
}

// ─── route handler ────────────────────────────────────────────────────────────

/**
 * Handles all /api/v1/jobs routes.
 *
 * ---
 * GET /api/v1/jobs
 *   Auth:    Bearer required
 *   Params:  status, category, priority, assignedTo, submittedBy, limit (max 200), offset
 *   200:     IJob[]  (staff: all matching; players: own only, staffOnly comments stripped)
 *   401:     { error: "Unauthorized" }
 *
 * POST /api/v1/jobs
 *   Auth:    Bearer required
 *   Body:    { title: string, description: string, category?: string,
 *              priority?: string, staffOnly?: boolean }
 *   201:     IJob  (newly created job)
 *   400:     { error: "title and description are required" }
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden: staffOnly requires staff privileges" }
 *
 * GET /api/v1/jobs/stats
 *   Auth:    Bearer required (staff only)
 *   200:     { total, byStatus, byCategory, byPriority, openAssigned, openUnassigned }
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden" }
 *
 * GET /api/v1/jobs/:id
 *   Auth:    Bearer required
 *   :id:     job number (e.g. "5") or UUID (e.g. "job-5")
 *   200:     IJob  (staffOnly comments stripped for non-staff)
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden" }
 *   404:     { error: "Not found" }
 *
 * PATCH /api/v1/jobs/:id
 *   Auth:    Bearer required (staff only)
 *   Body:    Partial<{ status, priority, assignedTo, title, description }>
 *   200:     IJob  (updated job)
 *   400:     { error: "Invalid JSON body" }
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden" }
 *   404:     { error: "Not found" }
 *
 * DELETE /api/v1/jobs/:id
 *   Auth:    Bearer required (staff only)
 *   204:     { deleted: true }
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden" }
 *   404:     { error: "Not found" }
 *
 * POST /api/v1/jobs/:id/comment
 *   Auth:    Bearer required
 *   Body:    { text: string, staffOnly?: boolean }
 *   201:     IJobComment  (the newly created comment)
 *   400:     { error: "text is required" }
 *   401:     { error: "Unauthorized" }
 *   403:     { error: "Forbidden" }
 *   404:     { error: "Not found" }
 * ---
 *
 * Auth: Bearer JWT required (userId supplied by engine router middleware).
 */
export async function jobsRouteHandler(req: Request, userId: string | null): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  if (path === "/api/v1/jobs/stats" && method === "GET") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    if (!(await isStaffUser(userId))) return ok({ error: "Forbidden" }, 403);
    const all = await jobs.find({});
    const byStatus: Record<string, number>   = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let openAssigned = 0; let openUnassigned = 0;
    for (const j of all) {
      byStatus[j.status]              = (byStatus[j.status] || 0) + 1;
      byCategory[j.category ?? "?"]   = (byCategory[j.category ?? "?"] || 0) + 1;
      byPriority[j.priority ?? "normal"] = (byPriority[j.priority ?? "normal"] || 0) + 1;
      if (j.status !== "closed" && j.status !== "resolved") {
        j.assignedTo ? openAssigned++ : openUnassigned++;
      }
    }
    return ok({ total: all.length, byStatus, byCategory, byPriority, openAssigned, openUnassigned });
  }

  if (path === "/api/v1/jobs" && method === "GET") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    const staff  = await isStaffUser(userId);
    const params = url.searchParams;
    const limit  = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
    const offset = Math.max(parseInt(params.get("offset") || "0",  10), 0);
    let all = await jobs.find({});
    all = all.filter((j) => staff ? true : !j.staffOnly && j.submittedBy === userId);
    const fs = params.get("status");      if (fs)  all = all.filter((j) => j.status      === fs);
    const fc = params.get("category");    if (fc)  all = all.filter((j) => j.category    === fc);
    const fp = params.get("priority");    if (fp)  all = all.filter((j) => j.priority    === fp);
    const fa = params.get("assignedTo");  if (fa)  all = all.filter((j) => j.assignedTo  === fa);
    const fb = params.get("submittedBy"); if (fb)  all = all.filter((j) => j.submittedBy === fb);
    all.sort((a, b) => b.number - a.number);
    const page = all.slice(offset, offset + limit);
    return ok(staff ? page : page.map(stripStaffComments));
  }

  if (path === "/api/v1/jobs" && method === "POST") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return ok({ error: "Invalid JSON body" }, 400); }
    const title       = typeof body.title       === "string" ? body.title.trim()       : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category    = typeof body.category    === "string" ? body.category.toLowerCase() : "request";
    const priority    = typeof body.priority    === "string" ? body.priority.toLowerCase() : "normal";
    const staffOnly   = body.staffOnly === true;
    if (!title || !description) return ok({ error: "title and description are required" }, 400);
    if (staffOnly && !staff)    return ok({ error: "Forbidden: staffOnly requires staff privileges" }, 403);
    const player = await dbojs.queryOne({ id: userId }) as { data?: { name?: string } } | undefined | false;
    const submitterName = (player && player.data?.name) || userId;
    const num = await getNextJobNumber();
    const now = Date.now();
    const job: IJob = {
      id: `job-${num}`, number: num, title, category,
      priority: (priority as IJob["priority"]) || "normal",
      status: "new", submittedBy: userId, submitterName,
      description, comments: [], createdAt: now, updatedAt: now, staffOnly,
    };
    await jobs.create(job);
    await jobHooks.emit("job:created", job);
    return ok(job, 201);
  }

  const jobMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)(\/comment)?$/);
  if (!jobMatch) return ok({ error: "Not Found" }, 404);

  const idParam  = jobMatch[1];
  const subRoute = jobMatch[2] || "";

  if (!subRoute && method === "GET") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    const job = await resolveJob(idParam);
    if (!job) return ok({ error: "Not found" }, 404);
    if (job.staffOnly && !staff) return ok({ error: "Forbidden" }, 403);
    if (!staff && job.submittedBy !== userId) return ok({ error: "Forbidden" }, 403);
    return ok(staff ? job : stripStaffComments(job));
  }

  if (!subRoute && method === "PATCH") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    if (!(await isStaffUser(userId))) return ok({ error: "Forbidden" }, 403);
    const job = await resolveJob(idParam);
    if (!job) return ok({ error: "Not found" }, 404);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return ok({ error: "Invalid JSON body" }, 400); }
    const ALLOWED = new Set(["status", "priority", "assignedTo", "title", "description"]);
    const updated = await jobs.atomicModify(job.id, (current) => {
      const next: IJob = { ...current, updatedAt: Date.now() };
      for (const field of ALLOWED) {
        if (field in body) (next as unknown as Record<string, unknown>)[field] = body[field];
      }
      return next;
    });
    if (updated.status !== job.status) {
      if (updated.status === "closed")       await jobHooks.emit("job:closed", updated);
      else if (updated.status === "resolved") await jobHooks.emit("job:resolved", updated);
      else if ((job.status === "closed" || job.status === "resolved") && updated.status === "open")
        await jobHooks.emit("job:reopened", updated);
      else await jobHooks.emit("job:status-changed", updated, job.status);
    }
    if (updated.priority !== job.priority) await jobHooks.emit("job:priority-changed", updated, job.priority ?? "normal");
    if (updated.assignedTo !== job.assignedTo) await jobHooks.emit("job:assigned", updated);
    return ok(updated);
  }

  if (!subRoute && method === "DELETE") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    if (!(await isStaffUser(userId))) return ok({ error: "Forbidden" }, 403);
    const job = await resolveJob(idParam);
    if (!job) return ok({ error: "Not found" }, 404);
    await jobs.delete({ id: job.id });
    await jobHooks.emit("job:deleted", job);
    return ok({ deleted: true }, 204);
  }

  if (subRoute === "/comment" && method === "POST") {
    if (!userId) return ok({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    const job = await resolveJob(idParam);
    if (!job) return ok({ error: "Not found" }, 404);
    if (job.staffOnly && !staff) return ok({ error: "Forbidden" }, 403);
    if (!staff && job.submittedBy !== userId) return ok({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return ok({ error: "Invalid JSON body" }, 400); }
    const text      = typeof body.text === "string" ? body.text.trim() : "";
    const staffOnly = body.staffOnly === true;
    if (!text) return ok({ error: "text is required" }, 400);
    if (staffOnly && !staff) return ok({ error: "Forbidden: staffOnly requires staff privileges" }, 403);
    const player = await dbojs.queryOne({ id: userId }) as { data?: { name?: string } } | undefined | false;
    const authorName = (player && player.data?.name) || userId;
    const comment: IJobComment = { id: crypto.randomUUID(), authorId: userId, authorName, text, timestamp: Date.now(), staffOnly };
    const updated: IJob = { ...job, comments: [...job.comments, comment], updatedAt: Date.now() };
    await jobs.update({ id: job.id }, updated);
    await jobHooks.emit("job:commented", updated, comment);
    return ok(comment, 201);
  }

  return ok({ error: "Not Found" }, 404);
}
