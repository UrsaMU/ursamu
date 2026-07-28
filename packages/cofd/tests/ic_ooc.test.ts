import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { icExec, oocExec } from "../src/commands/ic_ooc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function room(
  id: string,
  name: string,
  extraFlags: string[] = [],
) {
  return {
    id,
    name,
    flags: new Set(["room", ...extraFlags]),
    state: { name },
    contents: [],
  };
}

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

  it("+ooc bookmarks only rooms with ic flag", async () => {
    const me = mockPlayer({
      id: "p2",
      flags: new Set(["player", "connected", "approved"]),
      location: "20",
      state: {},
    });
    const teleports: string[][] = [];
    const u = mockU({ me });
    u.here = {
      ...room("20", "Dockside", ["ic"]),
      broadcast: () => {},
    } as typeof u.here;
    u.teleport = (id: string, dest: string) => {
      teleports.push([id, dest]);
      me.location = dest;
    };
    u.execute = () => {};
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "1") return [room("1", "OOC Lounge")];
      if (q.id === "20") return [room("20", "Dockside", ["ic"])];
      return [];
    };
    await oocExec(u);
    assertEquals(me.state.icLocation, "20");
    assertEquals(teleports[0]?.[1], "1");
  });

  it("+ooc does not bookmark non-ic rooms", async () => {
    const me = mockPlayer({
      id: "p2b",
      flags: new Set(["player", "connected", "approved"]),
      location: "8",
      state: { icLocation: "20" },
    });
    const u = mockU({ me });
    u.here = {
      ...room("8", "Chargen"),
      broadcast: () => {},
    } as typeof u.here;
    u.teleport = (_id: string, dest: string) => {
      me.location = dest;
    };
    u.execute = () => {};
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "1") return [room("1", "OOC Lounge")];
      if (q.id === "8") return [room("8", "Chargen")];
      return [];
    };
    await oocExec(u);
    // Prior marker kept; chargen is not IC.
    assertEquals(me.state.icLocation, "20");
    assertStringIncludes(u._sent.join("\n"), "Not IC");
  });

  it("+ic uses marker when set on IC room", async () => {
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
      if (q.id === "20") return [room("20", "Dockside", ["ic"])];
      return [];
    };
    await icExec(u);
    assertEquals(teleports[0]?.[1], "20");
  });

  it("+ic falls back to hub if marker room lost ic flag", async () => {
    const me = mockPlayer({
      id: "p3b",
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
    u.db.modify = async (
      _id: string,
      op: string,
      data: Record<string, unknown>,
    ) => {
      if (op === "$unset" && "data.icLocation" in data) {
        delete me.state.icLocation;
      }
    };
    u.db.search = async (q: Record<string, unknown>) => {
      if (q.id === "20") return [room("20", "Old Scene")]; // no ic
      if (q.id === "14") {
        return [room("14", "Blackfriars Circus", ["ic"])];
      }
      return [];
    };
    await icExec(u);
    assertEquals(me.state.icLocation, undefined);
    assertEquals(teleports[0]?.[1], "14");
  });

  it("+ic/clear unsets marker and stays put", async () => {
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
    u.cmd.args = ["clear", ""];
    await icExec(u);
    assertEquals(unsets.length, 1);
    assertEquals(teleports.length, 0);
    assertEquals(me.location, "20");
    assertEquals(me.state.icLocation, undefined);
    assertStringIncludes(u._sent.join("\n"), "Marker cleared");
  });

  it("+ic/clear with no marker stays put", async () => {
    const me = mockPlayer({
      id: "p4b",
      flags: new Set(["player", "connected", "approved"]),
      location: "8",
      state: {},
    });
    const teleports: string[][] = [];
    const u = mockU({ me });
    u.teleport = (id: string, dest: string) => {
      teleports.push([id, dest]);
      me.location = dest;
    };
    u.cmd.args = ["clear", ""];
    await icExec(u);
    assertEquals(teleports.length, 0);
    assertEquals(me.location, "8");
    assertStringIncludes(u._sent.join("\n"), "No marker");
  });
});
