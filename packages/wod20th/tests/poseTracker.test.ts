import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { bumpPose, getPoseCount } from "../core/poseTracker.ts";

describe("bumpPose", () => {
  it("creates a counter on first pose", () => {
    const next = bumpPose(undefined, "actor-a");
    assertEquals(next["actor-a"], 1);
  });

  it("increments an existing counter", () => {
    const next = bumpPose({ "actor-a": 4 }, "actor-a");
    assertEquals(next["actor-a"], 5);
  });

  it("does not mutate input", () => {
    const before = { "actor-a": 4 };
    const after = bumpPose(before, "actor-a");
    assertEquals(before["actor-a"], 4);
    assertEquals(after["actor-a"], 5);
  });

  it("only touches the named actor", () => {
    const next = bumpPose({ a: 2, b: 3 }, "a");
    assertEquals(next.a, 3);
    assertEquals(next.b, 3);
  });
});

describe("getPoseCount", () => {
  it("returns 0 for an unseen actor", () => {
    assertEquals(getPoseCount(undefined, "anyone"), 0);
    assertEquals(getPoseCount({}, "anyone"), 0);
  });

  it("returns the stored count", () => {
    assertEquals(getPoseCount({ "actor-a": 7 }, "actor-a"), 7);
  });
});
