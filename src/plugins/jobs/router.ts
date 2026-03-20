import { jobs, getNextJobNumber } from "./db.ts";
import type { IJob, IJobComment, JobBucket } from "../../@types/IJob.ts";
import { VALID_BUCKETS } from "../../@types/IJob.ts";
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

/** Strip staff-only comments (published === false) for non-staff viewers. */
function stripUnpublishedComments(job: IJob): IJob {
  return { ...job, comments: job.comments.filter(c => c.published) };
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
    const byStatus: Record<string, number> = {};
    const byBucket: Record<string, number> = {};
    let openAssigned = 0;
    let openUnassigned = 0;

    for (const j of all) {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
      byBucket[j.bucket] = (byBucket[j.bucket] || 0) + 1;
      if (j.status === "open") {
        j.assignedTo ? openAssigned++ : openUnassigned++;
      }
    }

    return jsonResponse({ total: all.length, byStatus, byBucket, openAssigned, openUnassigned });
  }

  // ── GET /api/v1/jobs ─────────────────────────────────────────────────────
  if (path === "/api/v1/jobs" && method === "GET") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);

    const params       = url.searchParams;
    const filterStatus = params.get("status")      || null;
    const filterBucket = params.get("bucket")      || null;
    const filterAssign = params.get("assignedTo")   || null;
    const filterSub    = params.get("submittedBy")  || null;
    const limit  = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
    const offset = Math.max(parseInt(params.get("offset") || "0",  10), 0);

    let all = await jobs.find({});

    // Non-staff can only see their own jobs or jobs they're added to
    if (!staff) {
      all = all.filter(j =>
        j.submittedBy === userId || j.additionalPlayers?.includes(userId)
      );
    }

    if (filterStatus) all = all.filter(j => j.status     === filterStatus);
    if (filterBucket) all = all.filter(j => j.bucket     === filterBucket);
    if (filterAssign) all = all.filter(j => j.assignedTo === filterAssign);
    if (filterSub)    all = all.filter(j => j.submittedBy === filterSub);

    all.sort((a, b) => b.number - a.number);
    const page = all.slice(offset, offset + limit);

    const result = staff ? page : page.map(stripUnpublishedComments);
    return jsonResponse(result);
  }

  // ── POST /api/v1/jobs ────────────────────────────────────────────────────
  if (path === "/api/v1/jobs" && method === "POST") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const title       = typeof body.title       === "string" ? body.title.trim()       : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const bucket      = typeof body.bucket      === "string" ? body.bucket.toUpperCase() : "SPHERE";

    if (!title || !description) {
      return jsonResponse({ error: "title and description are required" }, 400);
    }
    if (!VALID_BUCKETS.includes(bucket as JobBucket)) {
      return jsonResponse({ error: `Invalid bucket. Valid: ${VALID_BUCKETS.join(", ")}` }, 400);
    }

    const player = await dbojs.queryOne({ id: userId });
    const submitterName = (player && player.data?.name) || userId;

    const num = await getNextJobNumber();
    const now = Date.now();
    const job: IJob = {
      id:                `job-${num}`,
      number:            num,
      title,
      bucket:            bucket as JobBucket,
      status:            "open",
      submittedBy:       userId,
      submitterName:     String(submitterName),
      description,
      comments:          [],
      additionalPlayers: [],
      createdAt:         now,
      updatedAt:         now,
    };

    await jobs.create(job);
    await jobHooks.emit("job:created", job);
    return jsonResponse(job, 201);
  }

  // ── job by id/number sub-routes ──────────────────────────────────────────
  const jobMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)(\/comment)?$/);
  if (jobMatch) {
    const idParam  = jobMatch[1];
    const subRoute = jobMatch[2] || "";

    // ── GET /api/v1/jobs/:id ───────────────────────────────────────────────
    if (!subRoute && method === "GET") {
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const staff = await isStaffUser(userId);

      const job = await resolveJob(idParam);
      if (!job) return jsonResponse({ error: "Not found" }, 404);

      if (!staff && job.submittedBy !== userId && !job.additionalPlayers?.includes(userId)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      return jsonResponse(staff ? job : stripUnpublishedComments(job));
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

      const ALLOWED = new Set(["status", "assignedTo", "assigneeName", "title", "description", "bucket"]);

      const updated = await jobs.atomicModify(job.id, (current) => {
        const next: IJob = { ...current, updatedAt: Date.now() };
        for (const field of ALLOWED) {
          if (field in body) (next as unknown as Record<string, unknown>)[field] = body[field];
        }
        return next;
      });

      // Fire granular hooks
      if (updated.status !== job.status) {
        if (updated.status === "closed") {
          await jobHooks.emit("job:closed", updated);
        } else {
          await jobHooks.emit("job:status-changed", updated, job.status);
        }
      }
      if (updated.assignedTo !== job.assignedTo) {
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

      if (!staff && job.submittedBy !== userId && !job.additionalPlayers?.includes(userId)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const text = typeof body.text === "string" ? body.text.trim() : "";
      // published defaults to true; staff can set to false for internal notes
      const published = body.published === false && staff ? false : true;

      if (!text) return jsonResponse({ error: "text is required" }, 400);

      const player = await dbojs.queryOne({ id: userId });
      const authorName = (player && player.data?.name) || userId;

      const comment: IJobComment = {
        authorId:   userId,
        authorName: String(authorName),
        text,
        timestamp:  Date.now(),
        published,
      };

      const updated: IJob = { ...job, comments: [...job.comments, comment], updatedAt: Date.now() };
      await jobs.update({ id: job.id }, updated);
      await jobHooks.emit("job:commented", updated, comment);
      return jsonResponse(comment, 201);
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
