/**
 * @module handlers/sys
 *
 * Handles worker messages for system operations:
 *   sys:setConfig, sys:disconnect, sys:update, sys:reboot, sys:shutdown,
 *   sys:uptime, sys:gametime, sys:setgametime
 *   text:read, text:set
 */
import {
  sessions,
  send as coreSend,
  broadcastAll,
  setConfig,
  DBO,
} from "@ursamu/core";
import type { SDKContext } from "../sdk-service.ts";
import { dbojs } from "../../world/dbobjs.ts";
import { gameClock } from "../../world/game-clock.ts";
import type { IGameTime } from "../../world/types.ts";
import { runCodebaseUpdate } from "../../sys/codebase-update.ts";

const SERVER_START = Date.now();

function scheduleExit(code: number): void {
  if (code === 75) {
    // Soft-reboot: suppress connect/disconnect channel spam.
    import("../../sys/reboot-flag.ts").then(({ markSoftReboot }) => {
      markSoftReboot();
    }).catch(() => { /* ignore */ });
  }
  setTimeout(async () => {
    try {
      const { DBO: CoreDBO } = await import("@ursamu/core");
      await CoreDBO.close();
    } catch {
      /* best-effort */
    }
    Deno.exit(code);
  }, 500);
}

async function actorIsAdmin(context: SDKContext | undefined): Promise<boolean> {
  if (!context?.id) return true;
  const actor = await dbojs.queryOne({ id: context.id as string });
  const f = String(actor?.flags || "");
  return f.includes("admin") ||
    f.includes("wizard") ||
    f.includes("superuser");
}

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

const ALLOWED_CONFIG_KEYS = new Set([
  "server.name", "server.description", "server.banner",
  "server.corsOrigins", "server.maxConnections",
  "game.maxPlayers", "game.description", "game.loginMessage", "game.welcomeMessage",
]);

const texts = new DBO<{ id: string; content: string }>("server.texts");

export async function handleSysMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "sys:setConfig") {
    if (msg.key && msg.value !== undefined && ALLOWED_CONFIG_KEYS.has(msg.key as string)) {
      setConfig(msg.key as string, msg.value);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "sys:disconnect") {
    if (msg.id) {
      const session = sessions.get(msg.id as string);
      if (session) sessions.close(session.socketId);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "sys:update") {
    respond(worker, msgId, null);
    const socketTargets = context?.socketId
      ? [context.socketId as string]
      : [];
    const branch = String(msg.branch || "");
    const skipReboot = msg.reboot === false;

    if (!(await actorIsAdmin(context))) {
      coreSend(socketTargets, "%chGame>%cn Permission denied.");
      return;
    }

    (async () => {
      try {
        const result = await runCodebaseUpdate({
          branch,
          log: (line) =>
            coreSend(socketTargets, `%chGame>%cn ${line}`),
        });
        if (!result.ok || !result.cached) {
          coreSend(
            socketTargets,
            "%chGame>%cn Update aborted — game left " +
              "running (see messages above).",
          );
          return;
        }
        if (skipReboot) return;
        broadcastAll(
          "%chGame>%cn Update complete. Rebooting main " +
            "(sessions stay connected)...",
        );
        scheduleExit(75);
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        coreSend(
          socketTargets,
          `%chGame>%cn Update error (game left running): ${m}`,
        );
      }
    })();
    return;
  }

  if (type === "sys:reboot") {
    respond(worker, msgId, null);
    const withUpdate = msg.update !== false;
    const branch = String(msg.branch || "");
    const socketTargets = context?.socketId
      ? [context.socketId as string]
      : [];

    (async () => {
      if (withUpdate) {
        try {
          const result = await runCodebaseUpdate({
            branch,
            log: (line) =>
              coreSend(socketTargets, `%chGame>%cn ${line}`),
          });
          if (!result.ok || !result.cached) {
            coreSend(
              socketTargets,
              "%chGame>%cn Update failed — game left " +
                "running (no reboot).",
            );
            return;
          }
        } catch (e: unknown) {
          const m = e instanceof Error ? e.message : String(e);
          coreSend(
            socketTargets,
            `%chGame>%cn Update error: ${m} — game ` +
              "left running (no reboot).",
          );
          return;
        }
      }
      broadcastAll(
        "%chGame>%cn Server rebooting main " +
          "(sessions stay connected)...",
      );
      scheduleExit(75);
    })();
    return;
  }

  if (type === "sys:shutdown") {
    respond(worker, msgId, null);
    broadcastAll("Server shutting down...");
    scheduleExit(0);
    return;
  }

  if (type === "sys:uptime") {
    respond(worker, msgId, Date.now() - SERVER_START);
    return;
  }

  if (type === "sys:gametime") {
    respond(worker, msgId, gameClock.now());
    return;
  }

  if (type === "sys:setgametime") {
    if (msg.t) gameClock.set(msg.t as IGameTime);
    respond(worker, msgId, null);
    return;
  }
}

export async function handleTextMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "text:read") {
    if (!msg.id) { respond(worker, msgId, ""); return; }
    const entry = await texts.queryOne({ id: msg.id as string });
    respond(worker, msgId, entry ? entry.content : "");
    return;
  }

  if (type === "text:set") {
    if (msg.id === undefined || msg.content === undefined) { respond(worker, msgId, null); return; }
    const existing = await texts.queryOne({ id: msg.id as string });
    if (existing) {
      await texts.modify({ id: msg.id as string }, "$set", { content: msg.content as string });
    } else {
      await texts.create({ id: msg.id as string, content: msg.content as string });
    }
    respond(worker, msgId, null);
    return;
  }
}
