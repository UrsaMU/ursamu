/**
 * look UI layout builder — Figma-shaped blocks + actions.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildLookLayout,
  buildSingleLookLayout,
  exitCmd,
  getLookTheme,
  prefersUiLayout,
  roleTagFromTheme,
} from "../src/verbs/look-ui.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";
import { setConfig } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockObj(
  overrides: Partial<IDBObj> & { id: string; name: string },
): IDBObj {
  return {
    flags: new Set(overrides.flags ?? ["room"]),
    state: overrides.state ?? { name: overrides.name },
    location: overrides.location ?? "",
    contents: overrides.contents ?? [],
    ...overrides,
  } as IDBObj;
}

function mockU(): IUrsamuSDK {
  return {
    me: mockObj({
      id: "1",
      name: "Tester",
      flags: new Set(["player", "connected"]),
    }),
    util: {
      displayName: (o: IDBObj) =>
        String(o.state?.moniker || o.state?.name || o.name),
    },
    attr: { get: async () => null },
    canEdit: async () => false,
  } as unknown as IUrsamuSDK;
}

Deno.test(
  "buildSingleLookLayout: includes media for exits/things",
  OPTS,
  async () => {
    const exit = mockObj({
      id: "42",
      name: "North;n",
      flags: new Set(["exit"]),
      state: {
        name: "North;n",
        description: "A cold passage.",
      },
    });
    // Remote URL — no disk check required
    (exit as { data?: Record<string, unknown> }).data = {
      image: "https://cdn.example.com/exit.jpg",
    };
    const u = mockU();
    const comps = await buildSingleLookLayout({
      u,
      actor: u.me,
      target: exit,
      showContents: false,
      canEdit: false,
      exits: [],
      headerTitle: "North",
      description: "A cold passage.",
    });
    const types = comps.map((c) => c.type);
    assertEquals(types[0], "header");
    assertEquals(types.includes("media"), true);
    const media = comps.find((c) => c.type === "media") as {
      url?: string;
      alt?: string;
    };
    assertEquals(media?.url, "https://cdn.example.com/exit.jpg");
    assertEquals(media?.alt, "North");
    assertEquals(types.includes("text"), true);
  },
);

Deno.test(
  "buildSingleLookLayout: player media prefers /avatars",
  OPTS,
  async () => {
    const { ensureDir } = await import("@std/fs");
    const { join } = await import("@std/path");
    const prev = Deno.cwd();
    const tmp = await Deno.makeTempDir({ prefix: "look-av-" });
    try {
      Deno.chdir(tmp);
      await ensureDir("data/avatars");
      // Minimal JPEG so serve path is a real file
      const jpg = new Uint8Array([
        0xff, 0xd8, 0xff, 0xd9,
      ]);
      await Deno.writeFile(join("data/avatars", "7.jpg"), jpg);

      const player = mockObj({
        id: "7",
        name: "Bob",
        flags: new Set(["player", "connected"]),
        state: {
          name: "Bob",
          moniker: "%chBob%cn",
          avatarExt: "jpg",
        },
      });
      (player as { data?: Record<string, unknown> }).data = {
        avatarExt: "jpg",
        imageExt: "jpg",
      };
      const u = mockU();
      const comps = await buildSingleLookLayout({
        u,
        actor: u.me,
        target: player,
        showContents: false,
        canEdit: false,
        exits: [],
        headerTitle: "%chBob%cn(#7p)",
        description: "A player.",
      });
      const media = comps.find((c) => c.type === "media") as {
        url?: string;
        alt?: string;
      };
      assertEquals(!!media?.url?.startsWith("/avatars/7.jpg"), true);
      // Alt strips color codes
      assertEquals(media?.alt?.includes("%ch"), false);
    } finally {
      Deno.chdir(prev);
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test("exitCmd prefers shortest alias", OPTS, () => {
  const e = mockObj({
    id: "9",
    name: "North;n;no",
    flags: new Set(["exit"]),
    state: { name: "North;n;no" },
  });
  assertEquals(exitCmd(e), "n");
});

Deno.test("buildLookLayout: moniker over name on contents", OPTS, async () => {
  const room = mockObj({
    id: "1",
    name: "Lounge",
    flags: new Set(["room"]),
    state: { name: "Lounge", description: "A room." },
    contents: [],
  });
  const player = mockObj({
    id: "2",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: {
      name: "Alice",
      moniker: "%chAlicia%cn",
      "short-desc": "Glowing.",
      lastCommand: Date.now(),
    },
  });
  const thing = mockObj({
    id: "3",
    name: "sword",
    flags: new Set(["thing"]),
    state: {
      name: "sword",
      moniker: "Blade of Dusk",
    },
  });
  room.contents = [player, thing];
  const u = mockU();
  // Real moniker-first displayName (same order as SDK)
  u.util = {
    displayName: (o: IDBObj) => {
      const mon = String(o.state?.moniker ?? "").trim();
      if (mon) return mon.split(";")[0]?.trim() || mon;
      return String(o.state?.name || o.name || "Unknown");
    },
  } as IUrsamuSDK["util"];

  const comps = await buildLookLayout({
    u,
    actor: u.me,
    target: room,
    showContents: true,
    canEdit: false,
    exits: [],
    headerTitle: "Lounge",
    description: "A room.",
  });
  const chars = comps.find((c) => c.title === "Characters");
  const things = comps.find((c) => c.title === "Contents");
  const cItems = chars?.items as { label: string }[];
  const tItems = things?.items as { label: string }[];
  assertEquals(cItems[0]!.label, "%chAlicia%cn");
  assertEquals(tItems[0]!.label, "Blade of Dusk");
});

Deno.test("buildLookLayout: header text entities actions", OPTS, async () => {
  const room = mockObj({
    id: "1",
    name: "OOC Lounge",
    flags: new Set(["room"]),
    state: { name: "OOC Lounge", description: "Soft chairs." },
    contents: [],
  });
  const player = mockObj({
    id: "2",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: {
      name: "Alice",
      "short-desc": "A short description.",
      lastCommand: Date.now(),
    },
  });
  const exitN = mockObj({
    id: "10",
    name: "North;n",
    flags: new Set(["exit"]),
    state: { name: "North;n" },
  });
  const exitE = mockObj({
    id: "11",
    name: "East;e",
    flags: new Set(["exit"]),
    state: { name: "East;e" },
  });
  room.contents = [player, exitN, exitE];

  const comps = await buildLookLayout({
    u: mockU(),
    actor: mockU().me,
    target: room,
    showContents: true,
    canEdit: false,
    exits: [exitN, exitE],
    headerTitle: "OOC Lounge",
    description: "Soft chairs.",
  });

  const types = comps.map((c) => c.type);
  assertEquals(types.includes("header"), true);
  assertEquals(types.includes("text"), true);
  assertEquals(types.includes("entity-list"), true);
  assertEquals(types.includes("actions"), true);

  const header = comps.find((c) => c.type === "header");
  assertEquals(header?.title, "OOC Lounge");

  const ents = comps.find((c) => c.type === "entity-list");
  assertEquals(ents?.title, "Characters");
  const items = ents?.items as {
    label: string;
    sublabel?: string;
    action?: { cmd: string };
    dbref?: string;
  }[];
  assertEquals(items.length, 1);
  assertEquals(items[0]!.label, "Alice");
  assertEquals(items[0]!.sublabel, "A short description.");
  assertEquals(items[0]!.action?.cmd, "look #2");
  // Mortal: no staff dbref
  assertEquals(items[0]!.dbref, undefined);

  const acts = comps.find((c) => c.type === "actions");
  assertEquals(acts?.title, "Exits");
  assertEquals(
    (acts?.content as { columns?: number } | undefined)?.columns,
    2,
  );
  const exits = acts?.items as {
    label: string;
    badge?: string;
    action: { cmd: string };
  }[];
  assertEquals(exits.length, 2);
  const north = exits.find((e) => e.label === "North");
  assertEquals(north?.badge, "N");
  assertEquals(north?.action.cmd, "n");
});

Deno.test("buildLookLayout: staff sees dbref flags", OPTS, async () => {
  const staff = mockObj({
    id: "1",
    name: "Wiz",
    flags: new Set(["player", "connected", "wizard"]),
  });
  const room = mockObj({
    id: "5",
    name: "Hall",
    flags: new Set(["room"]),
    state: { name: "Hall", description: "A hall." },
  });
  const player = mockObj({
    id: "2",
    name: "Alice",
    flags: new Set(["player", "connected", "unfindable"]),
    state: { name: "Alice", "short-desc": "Here." },
  });
  const exitN = mockObj({
    id: "10",
    name: "North;n",
    flags: new Set(["exit", "dark"]),
    state: { name: "North;n" },
  });
  room.contents = [player, exitN];

  const u = mockU();
  u.me = staff;
  u.canEdit = async () => false;
  u.util = {
    displayName: (o: IDBObj) =>
      String(o.state?.moniker || o.state?.name || o.name),
  } as IUrsamuSDK["util"];

  const comps = await buildLookLayout({
    u,
    actor: staff,
    target: room,
    showContents: true,
    canEdit: true,
    exits: [exitN],
    headerTitle: "Hall(#5r)",
    description: "A hall.",
  });

  const ents = comps.find((c) => c.type === "entity-list");
  const items = ents?.items as {
    label: string;
    dbref?: string;
  }[];
  assertEquals(items![0]!.label, "Alice");
  assertEquals(!!items?.[0]?.dbref, true);
  assertStringIncludes(items![0]!.dbref!, "#2");

  const acts = comps.find((c) => c.type === "actions");
  const exits = acts?.items as { label: string; dbref?: string }[];
  assertEquals(exits![0]!.label, "North");
  assertEquals(!!exits?.[0]?.dbref, true);
  assertStringIncludes(exits![0]!.dbref!, "#10");
});

Deno.test("prefersUiLayout uses clientType on SDK", OPTS, () => {
  const u = mockU();
  assertEquals(prefersUiLayout(u), false);
  (u as { clientType?: string }).clientType = "web";
  assertEquals(prefersUiLayout(u), true);
  (u as { clientType?: string }).clientType = "telnet";
  assertEquals(prefersUiLayout(u), false);
});

Deno.test("getLookTheme + roleTags from config", OPTS, async () => {
  setConfig("plugins.globals.theme.look", {
    showShortDesc: false,
    showIdle: false,
    showExitAliases: false,
    aliasCase: "preserve",
    exitColumns: 3,
    descIndent: 2,
    roleTags: [
      { flag: "superuser", display: "%ch%cy<Dev>%cn" },
      { flag: "wizard", display: "(Wizard)" },
    ],
  });

  const theme = getLookTheme();
  assertEquals(theme.showShortDesc, false);
  assertEquals(theme.showIdle, false);
  assertEquals(theme.showExitAliases, false);
  assertEquals(theme.exitColumns, 3);
  assertEquals(theme.descIndent, 2);
  assertEquals(theme.aliasCase, "preserve");

  const wiz = mockObj({
    id: "9",
    name: "Wiz",
    flags: new Set(["player", "wizard"]),
  });
  assertEquals(roleTagFromTheme(wiz, theme), "(Wizard)");

  const dev = mockObj({
    id: "8",
    name: "Dev",
    flags: new Set(["player", "superuser"]),
  });
  assertEquals(roleTagFromTheme(dev, theme), "%ch%cy<Dev>%cn");

  const room = mockObj({
    id: "1",
    name: "Hall",
    flags: new Set(["room"]),
    state: { name: "Hall", description: "A hall." },
  });
  const player = mockObj({
    id: "2",
    name: "Alice",
    flags: new Set(["player", "connected", "wizard"]),
    state: {
      name: "Alice",
      "short-desc": "Should hide",
      lastCommand: Date.now(),
    },
  });
  const exitN = mockObj({
    id: "10",
    name: "North;n",
    flags: new Set(["exit"]),
    state: { name: "North;n" },
  });
  room.contents = [player, exitN];

  const comps = await buildLookLayout({
    u: mockU(),
    actor: mockU().me,
    target: room,
    showContents: true,
    canEdit: false,
    exits: [exitN],
    headerTitle: "Hall",
    description: "A hall.",
  });

  const text = comps.find((c) => c.type === "text");
  // Description is present (indent may be applied via layout chrome)
  assertEquals(
    String(text?.content ?? "").includes("A hall."),
    true,
  );

  const ents = comps.find((c) => c.type === "entity-list");
  const items = ents?.items as {
    sublabel?: string;
    meta?: string;
    role?: string;
  }[];
  assertEquals(items[0]!.sublabel, undefined);
  assertEquals(items[0]!.meta, undefined);
  assertEquals(items[0]!.role, "(Wizard)");

  const acts = comps.find((c) => c.type === "actions");
  assertEquals(
    (acts?.content as { columns?: number }).columns,
    3,
  );
  const exits = acts?.items as { badge?: string }[];
  assertEquals(exits[0]!.badge, undefined);

  // reset so other tests see defaults
  setConfig("plugins.globals.theme.look", {});
});
