import { assertEquals } from "@std/assert";
import {
  listZoneLoops,
  startZoneLoop,
  stopAllZoneLoops,
  stopZoneLoop,
} from "../src/zone-loop.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("zone loop start/stop registry", OPTS, () => {
  stopAllZoneLoops();
  let n = 0;
  startZoneLoop("z1", 60_000, () => {
    n += 1;
  });
  assertEquals(listZoneLoops(), ["z1"]);
  startZoneLoop("z2", 60_000, () => {});
  assertEquals(listZoneLoops().sort(), ["z1", "z2"]);
  stopZoneLoop("z1");
  assertEquals(listZoneLoops(), ["z2"]);
  stopAllZoneLoops();
  assertEquals(listZoneLoops(), []);
  assertEquals(n, 0);
});
