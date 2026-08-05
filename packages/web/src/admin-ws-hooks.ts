/**
 * Wire gameHooks + plugin hooks into the admin WS hub.
 *
 * Sources:
 *   gameHooks  — player/session/object lifecycle (engine)
 *   wikiHooks  — @ursamu/wiki (soft)
 *   jobHooks   — @ursamu/jobs (soft)
 */

import { gameHooks } from "@ursamu/mush";
import {
  broadcastAdmin,
  pushOnline,
  wikiPageStub,
} from "./admin-ws-hub.ts";
import {
  pushObjectById,
  pushObjectDelete,
} from "./admin-ws-objects.ts";

// deno-lint-ignore no-explicit-any
type AnyHandler = (...args: any[]) => void | Promise<void>;

// ── gameHooks: presence ──────────────────────────────────────────────────────

function wirePresenceHooks(): () => void {
  const refreshOnline: AnyHandler = () => {
    void pushOnline();
  };

  /** Login/logout also flip the connected flag on the DBO. */
  const onLogin: AnyHandler = (e) => {
    void pushOnline();
    void pushObjectById(e?.actorId);
  };
  const onLogout: AnyHandler = (e) => {
    void pushOnline();
    void pushObjectById(e?.actorId);
  };

  /** Socket drop with actor still known — online list may lag logout. */
  const onSessionClose: AnyHandler = (e) => {
    if (e?.actorId) {
      void pushOnline();
      void pushObjectById(e.actorId);
    }
  };

  gameHooks.on("player:login", onLogin);
  gameHooks.on("player:logout", onLogout);
  gameHooks.on("session:close", onSessionClose);
  // Reauth / soft-reboot restore — refresh online without spam
  gameHooks.on("session:auth", refreshOnline);

  return () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("player:logout", onLogout);
    gameHooks.off("session:close", onSessionClose);
    gameHooks.off("session:auth", refreshOnline);
  };
}

// ── gameHooks: world objects ─────────────────────────────────────────────────

function wireObjectHooks(): () => void {
  const onCreated: AnyHandler = (e) => {
    void pushObjectById(e?.objectId);
  };
  const onModified: AnyHandler = (e) => {
    void pushObjectById(e?.objectId);
  };
  const onDestroyed: AnyHandler = (e) => {
    pushObjectDelete(e?.objectId);
  };
  const onMoved: AnyHandler = (e) => {
    void pushObjectById(e?.objectId);
  };
  const onPlayerMove: AnyHandler = (e) => {
    // Player DBO location changed via exit traverse
    void pushObjectById(e?.actorId);
  };

  gameHooks.on("object:created", onCreated);
  gameHooks.on("object:modified", onModified);
  gameHooks.on("object:destroyed", onDestroyed);
  gameHooks.on("object:moved", onMoved);
  gameHooks.on("player:move", onPlayerMove);

  return () => {
    gameHooks.off("object:created", onCreated);
    gameHooks.off("object:modified", onModified);
    gameHooks.off("object:destroyed", onDestroyed);
    gameHooks.off("object:moved", onMoved);
    gameHooks.off("player:move", onPlayerMove);
  };
}

// ── plugin: wiki ─────────────────────────────────────────────────────────────

async function wireWikiHooks(): Promise<() => void> {
  try {
    const wiki = await import("@ursamu/wiki");
    const hooks = wiki.wikiHooks;
    if (!hooks) return () => {};

    const onUpsert: AnyHandler = (page) => {
      broadcastAdmin({
        type: "wiki:upsert",
        page: wikiPageStub(
          page.path,
          page.meta ?? {},
          page.body,
        ),
      });
    };
    const onDeleted: AnyHandler = (page) => {
      broadcastAdmin({
        type: "wiki:delete",
        path: String(page.path ?? ""),
      });
    };
    const onRenamed: AnyHandler = (page) => {
      if (page.oldPath) {
        broadcastAdmin({
          type: "wiki:delete",
          path: String(page.oldPath),
        });
      }
      onUpsert(page);
    };
    hooks.on("wiki:created", onUpsert);
    hooks.on("wiki:edited", onUpsert);
    hooks.on("wiki:deleted", onDeleted);
    hooks.on("wiki:renamed", onRenamed);
    console.log("[web] wikiHooks → admin WS");
    return () => {
      hooks.off("wiki:created", onUpsert);
      hooks.off("wiki:edited", onUpsert);
      hooks.off("wiki:deleted", onDeleted);
      hooks.off("wiki:renamed", onRenamed);
    };
  } catch {
    console.log("[web] @ursamu/wiki absent — wiki WS skipped");
    return () => {};
  }
}

// ── plugin: jobs ─────────────────────────────────────────────────────────────

async function wireJobHooks(): Promise<() => void> {
  try {
    const jobs = await import("@ursamu/jobs");
    const hooks = jobs.jobHooks;
    if (!hooks) return () => {};

    const upsert: AnyHandler = (job) => {
      broadcastAdmin({
        type: "job:upsert",
        job: job as Record<string, unknown>,
      });
    };
    const onDeleted: AnyHandler = (job) => {
      broadcastAdmin({
        type: "job:delete",
        id: String(job.id ?? ""),
        number: typeof job.number === "number"
          ? job.number
          : undefined,
      });
    };
    const events = [
      "job:created",
      "job:commented",
      "job:status-changed",
      "job:assigned",
      "job:priority-changed",
      "job:closed",
      "job:resolved",
      "job:reopened",
    ] as const;
    for (const ev of events) hooks.on(ev, upsert);
    hooks.on("job:deleted", onDeleted);
    console.log("[web] jobHooks → admin WS");
    return () => {
      for (const ev of events) hooks.off(ev, upsert);
      hooks.off("job:deleted", onDeleted);
    };
  } catch {
    console.log("[web] @ursamu/jobs absent — job WS skipped");
    return () => {};
  }
}

// ── plugin: bbs ──────────────────────────────────────────────────────────────

async function wireBbsHooks(): Promise<() => void> {
  try {
    // Variable specifier — soft peer (no hard JSR cycle with bbs).
    const spec = "@ursamu/bbs";
    // deno-lint-ignore no-explicit-any
    const bbs = await import(spec) as any;
    const onUp = bbs.onBbsBoardUpsert;
    const onDel = bbs.onBbsBoardDelete;
    if (typeof onUp !== "function") return () => {};

    const upsert: AnyHandler = (e) => {
      const board = e?.board;
      if (!board || typeof board !== "object") return;
      broadcastAdmin({
        type: "board:upsert",
        board: board as Record<string, unknown>,
      });
    };
    const deleted: AnyHandler = (e) => {
      broadcastAdmin({
        type: "board:delete",
        id: String(e?.id ?? ""),
        num: typeof e?.num === "number" ? e.num : undefined,
      });
    };
    onUp(upsert);
    if (typeof onDel === "function") onDel(deleted);
    console.log("[web] bbs events → admin WS");
    return () => {
      bbs.offBbsBoardUpsert?.(upsert);
      bbs.offBbsBoardDelete?.(deleted);
    };
  } catch {
    console.log("[web] @ursamu/bbs absent — board WS skipped");
    return () => {};
  }
}

/** Subscribe all sources; returns combined teardown. */
export async function wireAdminWsHooks(): Promise<() => void> {
  const offPresence = wirePresenceHooks();
  const offObjects = wireObjectHooks();
  const offWiki = await wireWikiHooks();
  const offJobs = await wireJobHooks();
  const offBbs = await wireBbsHooks();
  console.log(
    "[web] gameHooks → admin WS " +
      "(player/session/object + wiki + jobs + bbs)",
  );
  return () => {
    offPresence();
    offObjects();
    offWiki();
    offJobs();
    offBbs();
  };
}
