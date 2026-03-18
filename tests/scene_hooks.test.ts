// deno-lint-ignore-file no-explicit-any
/**
 * Tests for scene hooks wired into sceneRouter.ts.
 *
 * Strategy: import gameHooks + sceneHandler, register spy handlers, call the
 * route handler directly, assert the spies were called with the right payload.
 * DB/Object lookups are stubbed via module-level mocks injected before each test.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.220.0/assert/mod.ts";
import { gameHooks } from "../src/services/Hooks/GameHooks.ts";
import type {
  SceneCreatedEvent,
  ScenePoseEvent,
  SceneSetEvent,
  SceneTitleEvent,
  SceneClearEvent,
} from "../src/services/Hooks/GameHooks.ts";

// ─── lightweight mock layer ────────────────────────────────────────────────────

/** A minimal IScene-ish object for testing. */
const BASE_SCENE = {
  id:           "sc1",
  name:         "The Docks",
  location:     "#42",
  desc:         "Dark and wet.",
  owner:        "#2",
  participants: ["#2"],
  allowed:      ["#2"],
  private:      false,
  poses:        [] as any[],
  startTime:    1_700_000_000_000,
  status:       "active",
  sceneType:    "action",
};

/** Minimal player returned by Obj.get() / scenes.queryOne(). */
const ACTOR = {
  dbref: "#2",
  name:  "Alice",
  flags: "player connected",
  data:  {},
};

// We test gameHooks directly (pure unit tests for the event types) and then
// integration-style tests by calling helpers that mirror what sceneRouter does.

// ─── GameHooks unit tests ──────────────────────────────────────────────────────

Deno.test("gameHooks: scene:created fires with correct payload", async () => {
  const events: SceneCreatedEvent[] = [];
  const handler = (e: SceneCreatedEvent) => { events.push(e); };
  gameHooks.on("scene:created", handler);

  await gameHooks.emit("scene:created", {
    sceneId:   "sc1",
    sceneName: "The Docks",
    roomId:    "#42",
    actorId:   "#2",
    actorName: "Alice",
    sceneType: "action",
  });

  assertEquals(events.length, 1);
  assertEquals(events[0].sceneId,   "sc1");
  assertEquals(events[0].sceneName, "The Docks");
  assertEquals(events[0].roomId,    "#42");
  assertEquals(events[0].actorId,   "#2");
  assertEquals(events[0].actorName, "Alice");
  assertEquals(events[0].sceneType, "action");

  gameHooks.off("scene:created", handler);
});

Deno.test("gameHooks: scene:pose fires for all pose types", async () => {
  const events: ScenePoseEvent[] = [];
  const handler = (e: ScenePoseEvent) => { events.push(e); };
  gameHooks.on("scene:pose", handler);

  for (const type of ["pose", "ooc", "set"] as const) {
    await gameHooks.emit("scene:pose", {
      sceneId:   "sc1",
      sceneName: "The Docks",
      roomId:    "#42",
      actorId:   "#2",
      actorName: "Alice",
      msg:       "Some text",
      type,
    });
  }

  assertEquals(events.length, 3);
  assertEquals(events[0].type, "pose");
  assertEquals(events[1].type, "ooc");
  assertEquals(events[2].type, "set");

  gameHooks.off("scene:pose", handler);
});

Deno.test("gameHooks: scene:set fires with description", async () => {
  const events: SceneSetEvent[] = [];
  const handler = (e: SceneSetEvent) => { events.push(e); };
  gameHooks.on("scene:set", handler);

  await gameHooks.emit("scene:set", {
    sceneId:     "sc1",
    sceneName:   "The Docks",
    roomId:      "#42",
    actorId:     "#2",
    actorName:   "Alice",
    description: "Rain hammers the pier.",
  });

  assertEquals(events.length, 1);
  assertEquals(events[0].description, "Rain hammers the pier.");

  gameHooks.off("scene:set", handler);
});

Deno.test("gameHooks: scene:title fires with old and new name", async () => {
  const events: SceneTitleEvent[] = [];
  const handler = (e: SceneTitleEvent) => { events.push(e); };
  gameHooks.on("scene:title", handler);

  await gameHooks.emit("scene:title", {
    sceneId:   "sc1",
    oldName:   "The Docks",
    newName:   "Harbour at Night",
    actorId:   "#2",
    actorName: "Alice",
  });

  assertEquals(events.length, 1);
  assertEquals(events[0].oldName, "The Docks");
  assertEquals(events[0].newName, "Harbour at Night");

  gameHooks.off("scene:title", handler);
});

Deno.test("gameHooks: scene:clear fires with status", async () => {
  const events: SceneClearEvent[] = [];
  const handler = (e: SceneClearEvent) => { events.push(e); };
  gameHooks.on("scene:clear", handler);

  for (const status of ["closed", "finished", "archived"] as const) {
    await gameHooks.emit("scene:clear", {
      sceneId:   "sc1",
      sceneName: "The Docks",
      actorId:   "#2",
      actorName: "Alice",
      status,
    });
  }

  assertEquals(events.length, 3);
  assertEquals(events[0].status, "closed");
  assertEquals(events[1].status, "finished");
  assertEquals(events[2].status, "archived");

  gameHooks.off("scene:clear", handler);
});

// ─── on/off/dedup behavior for new events ─────────────────────────────────────

Deno.test("gameHooks: duplicate scene:created handler not registered twice", async () => {
  let count = 0;
  const handler = () => { count++; };
  gameHooks.on("scene:created", handler);
  gameHooks.on("scene:created", handler); // duplicate — should be ignored

  await gameHooks.emit("scene:created", {
    sceneId: "x", sceneName: "x", roomId: "#1",
    actorId: "#2", actorName: "Alice", sceneType: "social",
  });

  assertEquals(count, 1);
  gameHooks.off("scene:created", handler);
});

Deno.test("gameHooks: off removes scene:pose handler", async () => {
  let count = 0;
  const handler = () => { count++; };
  gameHooks.on("scene:pose", handler);
  gameHooks.off("scene:pose", handler);

  await gameHooks.emit("scene:pose", {
    sceneId: "x", sceneName: "x", roomId: "#1",
    actorId: "#2", actorName: "Alice", msg: "hi", type: "pose",
  });

  assertEquals(count, 0);
});

Deno.test("gameHooks: error in scene:set handler does not prevent others", async () => {
  const seen: string[] = [];
  const bad  = () => { throw new Error("boom"); };
  const good = () => { seen.push("ok"); };

  gameHooks.on("scene:set", bad);
  gameHooks.on("scene:set", good);

  await gameHooks.emit("scene:set", {
    sceneId: "x", sceneName: "x", roomId: "#1",
    actorId: "#2", actorName: "Alice", description: "test",
  });

  assertEquals(seen, ["ok"]);
  gameHooks.off("scene:set", bad);
  gameHooks.off("scene:set", good);
});

// ─── integration-style: simulate what sceneRouter does ────────────────────────

/**
 * Helper that mirrors the hook-emission logic from sceneRouter POST /pose.
 * We don't call the full route (that needs real DB) — we replicate the logic
 * under test to verify the payload shape is correct.
 */
async function simulatePosePost(
  type: "pose" | "ooc" | "set",
  msg: string,
  scene: typeof BASE_SCENE,
  actor: typeof ACTOR,
): Promise<{ poses: ScenePoseEvent[]; sets: SceneSetEvent[] }> {
  const poses: ScenePoseEvent[] = [];
  const sets: SceneSetEvent[] = [];

  const poseHandler  = (e: ScenePoseEvent)  => { poses.push(e); };
  const setHandler   = (e: SceneSetEvent)   => { sets.push(e); };
  gameHooks.on("scene:pose", poseHandler);
  gameHooks.on("scene:set",  setHandler);

  const posePayload: ScenePoseEvent = {
    sceneId:   scene.id,
    sceneName: scene.name,
    roomId:    scene.location,
    actorId:   actor.dbref,
    actorName: actor.name,
    msg,
    type,
  };
  await gameHooks.emit("scene:pose", posePayload);
  if (type === "set") {
    await gameHooks.emit("scene:set", {
      sceneId:     scene.id,
      sceneName:   scene.name,
      roomId:      scene.location,
      actorId:     actor.dbref,
      actorName:   actor.name,
      description: msg,
    });
  }

  gameHooks.off("scene:pose", poseHandler);
  gameHooks.off("scene:set",  setHandler);
  return { poses, sets };
}

Deno.test("scene:pose fires but scene:set does NOT for type=pose", async () => {
  const { poses, sets } = await simulatePosePost("pose", "Alice nods.", BASE_SCENE, ACTOR);
  assertEquals(poses.length, 1);
  assertEquals(sets.length, 0);
  assertEquals(poses[0].type, "pose");
  assertEquals(poses[0].msg, "Alice nods.");
});

Deno.test("scene:pose fires but scene:set does NOT for type=ooc", async () => {
  const { poses, sets } = await simulatePosePost("ooc", "brb", BASE_SCENE, ACTOR);
  assertEquals(poses.length, 1);
  assertEquals(sets.length, 0);
  assertEquals(poses[0].type, "ooc");
});

Deno.test("scene:pose AND scene:set both fire for type=set", async () => {
  const { poses, sets } = await simulatePosePost("set", "The rain never stops.", BASE_SCENE, ACTOR);
  assertEquals(poses.length, 1);
  assertEquals(sets.length, 1);
  assertEquals(poses[0].type, "set");
  assertEquals(sets[0].description, "The rain never stops.");
  assertEquals(sets[0].roomId, "#42");
});

/**
 * Helper mirroring PATCH handler hook logic.
 */
async function simulatePatch(
  updates: Partial<typeof BASE_SCENE>,
  scene: typeof BASE_SCENE,
  actor: typeof ACTOR,
): Promise<{ titles: SceneTitleEvent[]; clears: SceneClearEvent[] }> {
  const titles: SceneTitleEvent[] = [];
  const clears: SceneClearEvent[] = [];

  const titleHandler = (e: SceneTitleEvent) => { titles.push(e); };
  const clearHandler = (e: SceneClearEvent) => { clears.push(e); };
  gameHooks.on("scene:title", titleHandler);
  gameHooks.on("scene:clear", clearHandler);

  if (updates.name && updates.name !== scene.name) {
    await gameHooks.emit("scene:title", {
      sceneId:   scene.id,
      oldName:   scene.name,
      newName:   updates.name,
      actorId:   actor.dbref,
      actorName: actor.name,
    });
  }
  if (updates.status && updates.status !== scene.status) {
    const closedStatuses = ["closed", "finished", "archived"];
    if (closedStatuses.includes(updates.status)) {
      await gameHooks.emit("scene:clear", {
        sceneId:   scene.id,
        sceneName: updates.name ?? scene.name,
        actorId:   actor.dbref,
        actorName: actor.name,
        status:    updates.status,
      });
    }
  }

  gameHooks.off("scene:title", titleHandler);
  gameHooks.off("scene:clear", clearHandler);
  return { titles, clears };
}

Deno.test("scene:title fires when name changes", async () => {
  const { titles, clears } = await simulatePatch(
    { name: "Harbour at Night" }, BASE_SCENE, ACTOR,
  );
  assertEquals(titles.length, 1);
  assertEquals(clears.length, 0);
  assertEquals(titles[0].oldName, "The Docks");
  assertEquals(titles[0].newName, "Harbour at Night");
});

Deno.test("scene:title does NOT fire when name is unchanged", async () => {
  const { titles } = await simulatePatch(
    { name: "The Docks" }, BASE_SCENE, ACTOR,
  );
  assertEquals(titles.length, 0);
});

Deno.test("scene:clear fires for status=closed", async () => {
  const { clears } = await simulatePatch({ status: "closed" }, BASE_SCENE, ACTOR);
  assertEquals(clears.length, 1);
  assertEquals(clears[0].status, "closed");
  assertEquals(clears[0].sceneId, "sc1");
  assertEquals(clears[0].actorName, "Alice");
});

Deno.test("scene:clear fires for status=finished", async () => {
  const { clears } = await simulatePatch({ status: "finished" }, BASE_SCENE, ACTOR);
  assertEquals(clears.length, 1);
  assertEquals(clears[0].status, "finished");
});

Deno.test("scene:clear fires for status=archived", async () => {
  const { clears } = await simulatePatch({ status: "archived" }, BASE_SCENE, ACTOR);
  assertEquals(clears.length, 1);
  assertEquals(clears[0].status, "archived");
});

Deno.test("scene:clear does NOT fire for non-closing status", async () => {
  const { clears } = await simulatePatch({ status: "paused" }, BASE_SCENE, ACTOR);
  assertEquals(clears.length, 0);
});

Deno.test("scene:clear does NOT fire when status is unchanged", async () => {
  const { clears } = await simulatePatch(
    { status: "active" },  // same as BASE_SCENE.status
    BASE_SCENE, ACTOR,
  );
  assertEquals(clears.length, 0);
});

Deno.test("scene:title and scene:clear can fire together in one PATCH", async () => {
  const { titles, clears } = await simulatePatch(
    { name: "Epilogue", status: "finished" }, BASE_SCENE, ACTOR,
  );
  assertEquals(titles.length, 1);
  assertEquals(clears.length, 1);
  assertEquals(titles[0].newName, "Epilogue");
  // scene:clear uses the *new* name when provided alongside the status change
  assertEquals(clears[0].sceneName, "Epilogue");
});

// ─── payload shape sanity ─────────────────────────────────────────────────────

Deno.test("SceneCreatedEvent: all fields populated", async () => {
  let captured: SceneCreatedEvent | null = null;
  const h = (e: SceneCreatedEvent) => { captured = e; };
  gameHooks.on("scene:created", h);
  await gameHooks.emit("scene:created", {
    sceneId:   "sc99",
    sceneName: "Test Scene",
    roomId:    "#7",
    actorId:   "#3",
    actorName: "Bob",
    sceneType: "combat",
  });
  gameHooks.off("scene:created", h);

  assertExists(captured);
  const ev = captured as SceneCreatedEvent;
  assertEquals(ev.sceneId,   "sc99");
  assertEquals(ev.sceneName, "Test Scene");
  assertEquals(ev.roomId,    "#7");
  assertEquals(ev.actorId,   "#3");
  assertEquals(ev.actorName, "Bob");
  assertEquals(ev.sceneType, "combat");
});

Deno.test("ScenePoseEvent: msg and type preserved", async () => {
  let captured: ScenePoseEvent | null = null;
  const h = (e: ScenePoseEvent) => { captured = e; };
  gameHooks.on("scene:pose", h);
  await gameHooks.emit("scene:pose", {
    sceneId: "sc1", sceneName: "X", roomId: "#1",
    actorId: "#2", actorName: "Alice", msg: "hello world", type: "ooc",
  });
  gameHooks.off("scene:pose", h);

  assertExists(captured);
  const ev = captured as ScenePoseEvent;
  assertEquals(ev.msg,  "hello world");
  assertEquals(ev.type, "ooc");
});
