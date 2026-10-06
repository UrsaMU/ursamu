/** @module @ursamu/cinematic-plugin
 * Cinematic Unisystem — chargen, sheets, rolls, Drama Points.
 */
import "./commands.ts";

import type { IPlugin, SessionEvent } from "@ursamu/mush";
import { dbojs, gameHooks, registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import { readChar } from "./src/types.ts";
import { cinematicSystem } from "./src/game-system.ts";

async function routeHandler(
  // deno-lint-ignore no-explicit-any
  req: any,
  userId: string | null,
): Promise<Response> {
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const playerId = parts[3] ?? userId;
  const obj = await dbojs.queryOne({ id: playerId });
  if (!obj) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({ char: readChar(obj.state as Record<string, unknown>) }),
    { headers: { "content-type": "application/json" } },
  );
}

const onLogin = ({ actorId }: SessionEvent) => {
  void (async () => {
    try {
      const obj = await dbojs.queryOne({ id: actorId });
      if (!obj) return;
      const c = readChar(obj.state as Record<string, unknown>);
      if (c.status === "draft" || c.status === "revision") {
        const note = c.reviewNote
          ? `Revision: ${c.reviewNote}`
          : "Chargen in progress.";
        u_notify(actorId, `[Cinematic] ${note} Use +chargen.`);
      } else if (c.status === "submitted") {
        u_notify(
          actorId,
          "[Cinematic] Sheet pending staff review.",
        );
      }
    } catch {
      /* best-effort */
    }
  })();
};

function u_notify(actorId: string, message: string): void {
  gameHooks.emit("player:notify" as never, { actorId, message });
}

const onReady = () => {
  registerHelpDir(new URL("./help", import.meta.url), "cinematic");
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("gm:system:register", {
    system: cinematicSystem,
    events: [
      { name: "cinematic:roll", cue: "Cinematic Unisystem roll" },
    ],
  });
};

export const plugin: IPlugin = {
  name: "cinematic",
  version: "1.0.0",
  description:
    "Cinematic Unisystem — chargen, sheets, D10 rolls, Drama Points.",
  dependencies: [{ name: "help", version: ">=1.0.0" }],
  init: () => {
    registerPluginRoute("/api/v1/cinematic", routeHandler);
    gameHooks.on("player:login", onLogin);
    gameHooks.on("engine:ready", onReady);
    try {
      registerHelpDir(
        new URL("./help", import.meta.url),
        "cinematic",
      );
    } catch {
      /* engine:ready retry */
    }
    return true;
  },
  remove: () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("engine:ready", onReady);
  },
};

export default plugin;
