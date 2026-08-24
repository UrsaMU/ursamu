import { assertEquals } from "@std/assert";
import {
  offEventSceneHint,
  onEventSceneHint,
  registerSceneBridge,
  removeSceneBridge,
  type EventSceneHint,
} from "../src/scene-bridge.ts";
import { eventHooks } from "../src/hooks.ts";
import type { IGameEvent } from "../src/types.ts";
import { OPTS } from "./harness.ts";

const sample = (status: IGameEvent["status"]): IGameEvent => ({
  id: "ev-9",
  number: 9,
  title: "Bridge",
  description: "d",
  startTime: 1,
  createdBy: "p",
  createdByName: "P",
  status,
  tags: [],
  maxAttendees: 0,
  createdAt: 1,
  updatedAt: 1,
});

Deno.test("scene-bridge emits hints on cancel/complete", OPTS, async () => {
  registerSceneBridge();
  const hints: EventSceneHint[] = [];
  const h = (hint: EventSceneHint) => {
    hints.push(hint);
  };
  onEventSceneHint(h);

  await eventHooks.emit("event:cancelled", sample("cancelled"));
  await eventHooks.emit("event:completed", sample("completed"));
  await eventHooks.emit("event:updated", sample("upcoming")); // ignored

  assertEquals(hints.length, 2);
  assertEquals(hints[0]!.status, "cancelled");
  assertEquals(hints[1]!.status, "completed");

  offEventSceneHint(h);
  removeSceneBridge();
});
