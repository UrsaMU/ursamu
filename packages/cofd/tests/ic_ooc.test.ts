import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { icExec, oocExec } from "../src/commands/ic_ooc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+ic / +ooc", OPTS, () => {
  it("rejects unapproved players", async () => {
    const me = mockPlayer({
      id: "p1",
      flags: new Set(["player", "connected"]),
      location: "14",
      state: {},
    });
    const u = mockU({ me });
    await oocExec(u);
    assertStringIncludes(u._sent.join("\n"), "approved");
  });

  it("+ooc saves IC location and teleports", async () => {
    const me = mockPlayer({
      id: "p2",
      flags: new Set(["player", "connected", "approved"]),
      location: "20",
      state: {},
    });
    const teleports: string[][] = [];
    const u = mockU({ me });
    u.teleport = (id: string, dest: string) => {
      teleports.push([id, dest]);
      me.location = dest;
    };
    u.execute = () => {};
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "1") {
        return [{
          id: "1",
          name: "OOC Lounge",
          flags: new Set(["room"]),
          state: { name: "OOC Lounge" },
          contents: [],
        }];
      }
      return [];
    };
    await oocExec(u);
    assertEquals(me.state.icLocation, "20");
    assertEquals(teleports[0]?.[1], "1");
    assertStringIncludes(u._sent.join("\n"), "OOC");
  });

  it("+ic uses marker when set", async () => {
    const me = mockPlayer({
      id: "p3",
      flags: new Set(["player", "connected", "approved"]),
      location: "1",
      state: { icLocation: "20" },
    });
    const teleports: string[][] = [];
    const u = mockU({ me });
    u.teleport = (id: string, dest: string) => {
      teleports.push([id, dest]);
      me.location = dest;
    };
    u.execute = () => {};
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "20") {
        return [{
          id: "20",
          name: "Dockside",
          flags: new Set(["room"]),
          state: { name: "Dockside" },
          contents: [],
        }];
      }
      return [];
    };
    await icExec(u);
    assertEquals(teleports[0]?.[1], "20");
  });

  it("+ic/clear goes to hub and unsets marker", async () => {
    const me = mockPlayer({
      id: "p4",
      flags: new Set(["player", "connected", "approved"]),
      location: "20",
      state: { icLocation: "20" },
    });
    const teleports: string[][] = [];
    const unsets: unknown[] = [];
    const u = mockU({ me });
    u.teleport = (id: string, dest: string) => {
      teleports.push([id, dest]);
      me.location = dest;
    };
    u.execute = () => {};
    u.db.modify = async (
      _id: string,
      op: string,
      data: Record<string, unknown>,
    ) => {
      if (op === "$unset" && "data.icLocation" in data) {
        unsets.push(data);
        delete me.state.icLocation;
      }
    };
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "14") {
        return [{
          id: "14",
          name: "Blackfriars Circus",
          flags: new Set(["room"]),
          state: { name: "Blackfriars Circus" },
          contents: [],
        }];
      }
      return [];
    };
    u.cmd.args = ["clear", ""];
    await icExec(u);
    assertEquals(unsets.length, 1);
    assertEquals(teleports[0]?.[1], "14");
  });
});
