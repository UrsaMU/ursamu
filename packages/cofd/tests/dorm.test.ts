/**
 * Freehold dorm home assignment.
 */
import { assertEquals } from "jsr:@std/assert@^0.224.0";
import { getConfig, setConfig } from "@ursamu/ursamu";
import {
  assignDormHome,
  dormRoomIdForTemplate,
} from "../src/support/dorm.ts";
import { mockU, mockPlayer } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("dormRoomIdForTemplate: map and aliases", OPTS, () => {
  const prev = getConfig("plugins.cofd.dorms");
  try {
    setConfig("plugins.cofd.dorms", {
      changeling: "56",
      werewolf: "99",
    });
    assertEquals(dormRoomIdForTemplate("changeling"), "56");
    assertEquals(dormRoomIdForTemplate("Changeling"), "56");
    assertEquals(dormRoomIdForTemplate("werewolf"), "99");
    assertEquals(dormRoomIdForTemplate("mortal"), null);
  } finally {
    setConfig("plugins.cofd.dorms", prev);
  }
});

Deno.test("dormRoomIdForTemplate: ctlDorm legacy key", OPTS, () => {
  const prevD = getConfig("plugins.cofd.dorms");
  const prevC = getConfig("plugins.cofd.ctlDorm");
  try {
    setConfig("plugins.cofd.dorms", undefined);
    setConfig("plugins.cofd.ctlDorm", "#56");
    assertEquals(dormRoomIdForTemplate("changeling"), "56");
    assertEquals(dormRoomIdForTemplate("lost"), "56");
  } finally {
    setConfig("plugins.cofd.dorms", prevD);
    setConfig("plugins.cofd.ctlDorm", prevC);
  }
});

Deno.test("assignDormHome: writes data.home", OPTS, async () => {
  const prev = getConfig("plugins.cofd.dorms");
  try {
    setConfig("plugins.cofd.dorms", { changeling: "56" });
    const target = mockPlayer({ id: "p9", name: "Lostling" });
    const u = mockU({ me: target });
    u._store.put(target);
    const teleports: string[] = [];
    // deno-lint-ignore no-explicit-any
    (u as any).teleport = async (id: string, dest: string) => {
      teleports.push(`${id}->${dest}`);
    };

    const id = await assignDormHome(u, target.id, "changeling", {
      teleport: true,
    });
    assertEquals(id, "56");
    assertEquals(target.state.home, "56");
    assertEquals(teleports[0], "p9->56");
  } finally {
    setConfig("plugins.cofd.dorms", prev);
  }
});
