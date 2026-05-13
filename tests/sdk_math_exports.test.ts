// Direct TS-export tests for non-trivial math/spatial/interpolation/vector
// primitives. The softcode-layer (register) is covered separately.

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dist2d, dist3d, distSq2d, distSq3d, manhattan, chebyshev, angle2d, bearing,
  lerp, inverseLerp, remap, smoothstep, smootherstep, clamp,
  vsize, vsizeSq, vdistance, vdistanceSq, vlerp, vclamp,
} from "../src/services/Softcode/stdlib/math.ts";

Deno.test("dist2d 3-4-5 triangle", () => {
  assertEquals(dist2d(0, 0, 3, 4), 5);
});

Deno.test("dist3d 1-2-2 → 3", () => {
  assertEquals(dist3d(0, 0, 0, 1, 2, 2), 3);
});

Deno.test("distSq2d / distSq3d parity with dist^2", () => {
  assertAlmostEquals(distSq2d(0, 0, 3, 4), 25);
  assertAlmostEquals(distSq2d(1, 1, 4, 5), dist2d(1, 1, 4, 5) ** 2);
  assertAlmostEquals(distSq3d(0, 0, 0, 1, 2, 2), 9);
  assertAlmostEquals(distSq3d(-1, 2, 3, 4, -1, 0), dist3d(-1, 2, 3, 4, -1, 0) ** 2);
});

Deno.test("manhattan / chebyshev", () => {
  assertEquals(manhattan(0, 0, 3, 4), 7);
  assertEquals(chebyshev(0, 0, 3, 4), 4);
});

Deno.test("angle2d radians: (0,0)->(1,0) is 0", () => {
  assertAlmostEquals(angle2d(0, 0, 1, 0), 0);
});

Deno.test("bearing — MUSH convention 0=N CW", () => {
  // +Y is north
  assertAlmostEquals(bearing(0, 0, 0, 1), 0);
  // +X is east
  assertAlmostEquals(bearing(0, 0, 1, 0), 90);
  // -Y is south
  assertAlmostEquals(bearing(0, 0, 0, -1), 180);
  // -X is west
  assertAlmostEquals(bearing(0, 0, -1, 0), 270);
});

Deno.test("lerp basic + extrapolates beyond [0,1]", () => {
  assertEquals(lerp(0, 10, 0.5), 5);
  assertEquals(lerp(0, 10, 1.5), 15);
  assertEquals(lerp(0, 10, -0.5), -5);
});

Deno.test("inverseLerp + degenerate returns 0", () => {
  assertEquals(inverseLerp(0, 10, 5), 0.5);
  assertEquals(inverseLerp(5, 5, 5), 0); // documented: returns 0 not NaN
});

Deno.test("remap maps midpoint", () => {
  assertEquals(remap(50, 0, 100, -1, 1), 0);
  assertEquals(remap(0, 0, 100, -1, 1), -1);
  assertEquals(remap(100, 0, 100, -1, 1), 1);
});

Deno.test("smoothstep endpoints + midpoint + monotonic", () => {
  assertEquals(smoothstep(0, 1, 0), 0);
  assertEquals(smoothstep(0, 1, 1), 1);
  assertAlmostEquals(smoothstep(0, 1, 0.5), 0.5);
  // monotonic
  let prev = -Infinity;
  for (let i = 0; i <= 10; i++) {
    const v = smoothstep(0, 1, i / 10);
    if (v < prev) throw new Error(`not monotonic at ${i}`);
    prev = v;
  }
});

Deno.test("smootherstep endpoints + midpoint", () => {
  assertEquals(smootherstep(0, 1, 0), 0);
  assertEquals(smootherstep(0, 1, 1), 1);
  assertAlmostEquals(smootherstep(0, 1, 0.5), 0.5);
});

Deno.test("clamp normalizes swapped bounds", () => {
  assertEquals(clamp(15, 0, 10), 10);
  assertEquals(clamp(-5, 0, 10), 0);
  assertEquals(clamp(5, 0, 10), 5);
  assertEquals(clamp(15, 10, 0), 10); // swapped bounds
  assertEquals(clamp(-5, 10, 0), 0);
});

Deno.test("vsize 3D and 2D", () => {
  assertEquals(vsize([3, 0, 4]), 5);
  assertEquals(vsize([3, 4]), 5);
});

Deno.test("vsizeSq", () => {
  assertEquals(vsizeSq([3, 0, 4]), 25);
});

Deno.test("vdistance / vdistanceSq", () => {
  assertEquals(vdistance([0, 0, 0], [3, 0, 4]), 5);
  assertEquals(vdistanceSq([0, 0, 0], [3, 0, 4]), 25);
});

Deno.test("vlerp midpoint", () => {
  assertEquals(vlerp([0, 0, 0], [10, 10, 10], 0.5), [5, 5, 5]);
});

Deno.test("vclamp componentwise", () => {
  assertEquals(vclamp([-5, 5, 15], 0, 10), [0, 5, 10]);
});
