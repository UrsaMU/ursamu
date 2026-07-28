import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { viewsExec } from "../src/commands/views.ts";
import { cofdDescformatHandler } from "../src/support/look_desc.ts";
import type { RoomViews } from "../src/views/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function wireHere(
  u: ReturnType<typeof mockU>,
  here: { id: string; state: Record<string, unknown> },
) {
  u.here = { ...u.here, ...here, id: here.id, state: here.state };
  u.db.modify = (id: string, op: string, data: Record<string, unknown>) => {
    if (id === here.id && op === "$set" && data["data.room_views"] !== undefined) {
      here.state.room_views = data["data.room_views"];
      (u.here as { state: Record<string, unknown> }).state = here.state;
    }
    return Promise.resolve();
  };
}

describe("+views", OPTS, () => {
  it("/add creates an open view on here", async () => {
    const here = {
      id: "room1",
      state: {} as Record<string, unknown>,
    };
    const u = mockU({
      me: mockPlayer({ id: "1", name: "Builder" }),
      args: ["add", "Angel=Green wings drip with rain."],
      here: { id: "room1", name: "Circus", flags: new Set(["room"]) },
    });
    wireHere(u, here);

    await viewsExec(u);

    assertStringIncludes(u._sent.join("\n"), "added");
    const views = here.state.room_views as RoomViews;
    assertEquals(views.angel.name, "Angel");
    assertEquals(views.angel.lock, "");
    assertEquals(views.angel.text, "Green wings drip with rain.");
  });

  it("/lock sets and clears locks", async () => {
    const here = {
      id: "room1",
      state: {
        room_views: {
          angel: {
            name: "Angel",
            text: "x",
            lock: "",
            createdAt: 1,
            updatedAt: 1,
            createdBy: "1",
          },
        },
      } as Record<string, unknown>,
    };
    const u = mockU({
      args: ["lock", "Angel=flag(approved)"],
      here: { id: "room1", flags: new Set(["room"]), state: here.state },
    });
    wireHere(u, here);
    await viewsExec(u);
    assertEquals(
      (here.state.room_views as RoomViews).angel.lock,
      "flag(approved)",
    );

    u.cmd.args = ["lock", "Angel=!"];
    u._sent.length = 0;
    await viewsExec(u);
    assertEquals((here.state.room_views as RoomViews).angel.lock, "");
  });

  it("locked view hidden when checkLock fails", async () => {
    const hereState = {
      room_views: {
        secret: {
          name: "Secret",
          text: "hidden text",
          lock: "flag(approved)",
          createdAt: 1,
          updatedAt: 1,
          createdBy: "1",
        },
      },
    };
    const u = mockU({
      args: ["", "Secret"],
      checkLockResult: false,
      here: {
        id: "room1",
        name: "Circus",
        flags: new Set(["room"]),
        state: hereState,
      },
    });
    await viewsExec(u);
    assertStringIncludes(u._sent.join("\n"), "No such view");
  });

  it("locked view readable when checkLock passes", async () => {
    const hereState = {
      room_views: {
        secret: {
          name: "Secret",
          text: "hidden text",
          lock: "flag(approved)",
          createdAt: 1,
          updatedAt: 1,
          createdBy: "1",
        },
      },
    };
    const u = mockU({
      args: ["", "Secret"],
      checkLockResult: true,
      here: {
        id: "room1",
        name: "Circus",
        flags: new Set(["room"]),
        state: hereState,
      },
    });
    await viewsExec(u);
    assertStringIncludes(u._sent.join("\n"), "hidden text");
  });

  it("/del removes a view", async () => {
    const here = {
      id: "room1",
      state: {
        room_views: {
          angel: {
            name: "Angel",
            text: "x",
            lock: "",
            createdAt: 1,
            updatedAt: 1,
            createdBy: "1",
          },
        },
      } as Record<string, unknown>,
    };
    const u = mockU({
      args: ["del", "Angel"],
      here: { id: "room1", flags: new Set(["room"]), state: here.state },
    });
    wireHere(u, here);
    await viewsExec(u);
    assertEquals((here.state.room_views as RoomViews).angel, undefined);
  });
});

describe("DESCFORMAT views banner", OPTS, () => {
  it("adds trailing blank and banner when views visible", async () => {
    const me = mockPlayer({ id: "1" });
    const u = mockU({
      me,
      checkLockResult: true,
    });
    const room = mockPlayer({
      id: "r1",
      flags: new Set(["room"]),
      state: {
        room_views: {
          angel: {
            name: "Angel",
            text: "wings",
            lock: "",
            createdAt: 1,
            updatedAt: 1,
            createdBy: "1",
          },
        },
      },
    });
    const out = await cofdDescformatHandler(u, room, "A quiet circus.");
    assertStringIncludes(out ?? "", "quiet circus");
    assertStringIncludes(out ?? "", "+views");
    assertStringIncludes(out ?? "", "Available");
    // Trailing structure: desc ends, blank, banner
    assertEquals((out ?? "").includes("\n\n"), true);
  });

  it("no banner when no visible views", async () => {
    const u = mockU({ checkLockResult: false });
    const room = mockPlayer({
      id: "r2",
      flags: new Set(["room"]),
      state: {
        room_views: {
          secret: {
            name: "Secret",
            text: "x",
            lock: "flag(wizard)",
            createdAt: 1,
            updatedAt: 1,
            createdBy: "1",
          },
        },
      },
    });
    const out = await cofdDescformatHandler(u, room, "Plain street.");
    assertStringIncludes(out ?? "", "Plain street");
    assertEquals((out ?? "").includes("+views"), false);
    // Still trailing newline after desc
    assertEquals((out ?? "").endsWith("\n"), true);
  });
});
