// Fae sight flags, CONFORMAT maskName, DESCFORMAT FAEDESC.

import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import {
  cofdConformatHandler,
  cofdDescformatHandler,
} from "../src/support/look_format.ts";
import {
  hasFaeSight,
  syncSightFlags,
  templateSightFlags,
} from "../src/support/sight.ts";
import {
  resolveItemLookName,
  resolveLookDesc,
  resolveRoomFlavor,
  resolveWayName,
} from "../src/support/perception.ts";
import type { IDBObj } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("templateSightFlags", OPTS, () => {
  it("maps templates to sight flags", () => {
    assertEquals(templateSightFlags("changeling"), ["fae"]);
    assertEquals(templateSightFlags("Changeling"), ["fae"]);
    assertEquals(templateSightFlags("werewolf"), ["forsaken"]);
    assertEquals(templateSightFlags("mortal"), []);
    assertEquals(templateSightFlags("vampire"), []);
  });
});

describe("syncSightFlags", OPTS, () => {
  it("adds fae for changeling, strips on mortal", async () => {
    const target = mockPlayer({
      id: "s1",
      name: "Pix",
      flags: new Set(["player", "connected"]),
    });
    const u = mockU({ me: target });
    u._store.put(target);

    await syncSightFlags(u, target, {
      template: "changeling",
    });
    assertEquals(target.flags.has("fae"), true);

    await syncSightFlags(u, target, { template: "mortal" });
    assertEquals(target.flags.has("fae"), false);
  });

  it("keeps sticky fae on mortal", async () => {
    const target = mockPlayer({
      id: "s2",
      flags: new Set(["player", "fae"]),
    });
    const u = mockU({ me: target });
    u._store.put(target);

    await syncSightFlags(u, target, {
      template: "mortal",
      sightSticky: ["fae"],
    });
    assertEquals(target.flags.has("fae"), true);
  });
});

describe("hasFaeSight", OPTS, () => {
  it("true only for fae flag (not staff alone)", () => {
    assertEquals(
      hasFaeSight(mockPlayer({ flags: new Set(["fae"]) })),
      true,
    );
    assertEquals(
      hasFaeSight(
        mockPlayer({ flags: new Set(["admin"]) }),
      ),
      false,
    );
    assertEquals(
      hasFaeSight(
        mockPlayer({
          flags: new Set(["superuser", "player"]),
        }),
      ),
      false,
    );
    assertEquals(
      hasFaeSight(
        mockPlayer({ flags: new Set(["player"]) }),
      ),
      false,
    );
  });
});

describe("resolveItemLookName", OPTS, () => {
  const fruit: IDBObj = {
    id: "f1",
    name: "Amaranthine",
    flags: new Set(["thing"]),
    state: {
      cofd_item: {
        key: "amaranthine",
        kind: "goblin-fruit",
        customLabel: "Amaranthine",
        maskName: "Strange fruit",
        count: 1,
      },
    },
    contents: [],
  };

  it("mortals see maskName", () => {
    const looker = mockPlayer({
      flags: new Set(["player"]),
    });
    assertEquals(
      resolveItemLookName(looker, fruit),
      "Strange fruit",
    );
  });

  it("fae see true name", () => {
    const looker = mockPlayer({
      flags: new Set(["player", "fae"]),
    });
    assertEquals(
      resolveItemLookName(looker, fruit),
      "Amaranthine",
    );
  });
});

describe("resolveLookDesc FAEDESC", OPTS, () => {
  const room = mockPlayer({
    id: "r1",
    flags: new Set(["room"]),
    state: {
      description: "A brick alley.",
      faedesc: "Thorns coil through the brick.",
    },
  });

  it("material for mortals", () => {
    const looker = mockPlayer({
      flags: new Set(["player"]),
    });
    assertEquals(
      resolveLookDesc(looker, room, "A brick alley."),
      "A brick alley.",
    );
  });

  it("faedesc for fae", () => {
    const looker = mockPlayer({
      flags: new Set(["player", "fae"]),
    });
    assertEquals(
      resolveLookDesc(looker, room, "A brick alley."),
      "Thorns coil through the brick.",
    );
  });
});

describe("CONFORMAT / DESCFORMAT integration", OPTS, () => {
  it("CONFORMAT uses maskName without fae", async () => {
    const me = mockPlayer({
      id: "1",
      name: "Bob",
      flags: new Set(["player", "connected"]),
    });
    const u = mockU({ me });
    const fruit: IDBObj = {
      id: "3",
      name: "Faerie Peach",
      flags: new Set(["thing"]),
      state: {
        cofd_item: {
          key: "faerie-peach",
          kind: "goblin-fruit",
          customLabel: "Faerie Peach",
          maskName: "Unusual fruit",
          count: 2,
        },
      },
      contents: [],
    };
    const room = mockPlayer({
      id: "room1",
      flags: new Set(["room"]),
      contents: [fruit],
    });
    const out = await cofdConformatHandler(u, room, "#3");
    assertStringIncludes(out ?? "", "Unusual fruit");
    assertEquals((out ?? "").includes("Faerie Peach"), false);
  });

  it("CONFORMAT true name with fae", async () => {
    const me = mockPlayer({
      id: "1",
      name: "Pix",
      flags: new Set(["player", "connected", "fae"]),
    });
    const u = mockU({ me });
    const fruit: IDBObj = {
      id: "3",
      name: "Faerie Peach",
      flags: new Set(["thing"]),
      state: {
        cofd_item: {
          key: "faerie-peach",
          kind: "goblin-fruit",
          customLabel: "Faerie Peach",
          maskName: "Unusual fruit",
          count: 1,
        },
      },
      contents: [],
    };
    const room = mockPlayer({
      id: "room1",
      flags: new Set(["room"]),
      contents: [fruit],
    });
    const out = await cofdConformatHandler(u, room, "#3");
    assertStringIncludes(out ?? "", "Faerie Peach");
  });

  it("DESCFORMAT swaps FAEDESC for fae", async () => {
    const me = mockPlayer({
      flags: new Set(["player", "fae"]),
    });
    const u = mockU({ me });
    const room = mockPlayer({
      id: "r2",
      flags: new Set(["room"]),
      state: {
        faedesc: "The Hedge breathes.",
      },
    });
    const out = await cofdDescformatHandler(
      u,
      room,
      "A quiet street.",
    );
    assertStringIncludes(out ?? "", "The Hedge breathes.");
    assertEquals(
      (out ?? "").includes("quiet street"),
      false,
    );
  });
});

describe("resolveWayName / resolveRoomFlavor", OPTS, () => {
  it("mortals see gate maskName", () => {
    const mortal = mockPlayer({ flags: new Set(["player"]) });
    const fae = mockPlayer({
      flags: new Set(["player", "fae"]),
    });
    const way = {
      name: "Thorn Gate",
      maskName: "Old cellar door",
    };
    assertEquals(
      resolveWayName(mortal, way),
      "Old cellar door",
    );
    assertEquals(resolveWayName(fae, way), "Thorn Gate");
  });

  it("default gate mask when unset", () => {
    const mortal = mockPlayer({ flags: new Set(["player"]) });
    assertEquals(
      resolveWayName(mortal, { name: "Secret Way" }),
      "Strange passage",
    );
  });

  it("room flavor dual", () => {
    const mortal = mockPlayer({ flags: new Set(["player"]) });
    const fae = mockPlayer({
      flags: new Set(["player", "fae"]),
    });
    const room = {
      realm: "hedge" as const,
      danger: "hedge" as const,
      flavor: "Thorns whisper your name.",
      maskFlavor: "A drafty alley.",
    };
    assertEquals(
      resolveRoomFlavor(mortal, room),
      "A drafty alley.",
    );
    assertEquals(
      resolveRoomFlavor(fae, room),
      "Thorns whisper your name.",
    );
  });
});
