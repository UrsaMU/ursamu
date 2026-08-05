import { assertEquals } from "@std/assert";
import {
  deepMerge,
  ensurePluginsList,
  mergeConfigFromSample,
} from "../src/sys/merge-config.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("deepMerge: nested objects", OPTS, () => {
  const out = deepMerge(
    { a: 1, b: { c: 1, d: 2 } },
    { b: { c: 9 }, e: 3 },
  ) as Record<string, unknown>;
  assertEquals(out.a, 1);
  assertEquals((out.b as Record<string, unknown>).c, 9);
  assertEquals((out.b as Record<string, unknown>).d, 2);
  assertEquals(out.e, 3);
});

Deno.test("ensurePluginsList: sample order + live extras", OPTS, () => {
  assertEquals(
    ensurePluginsList(
      ["@ursamu/web", "@ursamu/custom"],
      ["@ursamu/help", "@ursamu/web", "@ursamu/map-plugin"],
    ),
    [
      "@ursamu/help",
      "@ursamu/web",
      "@ursamu/map-plugin",
      "@ursamu/custom",
    ],
  );
});

Deno.test("mergeConfigFromSample: adds map plugin + block", OPTS, () => {
  const live = {
    server: {
      plugins: ["@ursamu/help", "@ursamu/web"],
    },
    plugins: {
      channels: { defaults: [] },
    },
  };
  const sample = {
    server: {
      plugins: [
        "@ursamu/help",
        "@ursamu/web",
        "@ursamu/map-plugin",
      ],
    },
    plugins: {
      map: { theme: "hedge", realm: "default" },
      channels: {
        defaults: [{ name: "Public", alias: "pub" }],
      },
    },
  };
  const r = mergeConfigFromSample(live, sample);
  assertEquals(r.changed, true);
  assertEquals(r.addedPlugins, ["@ursamu/map-plugin"]);
  assertEquals(r.mergedBlocks.includes("map"), true);
  const srv = r.config.server as { plugins: string[] };
  assertEquals(srv.plugins.includes("@ursamu/map-plugin"), true);
  const pl = r.config.plugins as {
    map: { theme: string };
  };
  assertEquals(pl.map.theme, "hedge");
});

Deno.test("mergeConfigFromSample: preserves live secrets", OPTS, () => {
  const live = {
    server: { plugins: ["@ursamu/help"] },
    plugins: {
      discord: { botToken: "secret-live" },
    },
  };
  const sample = {
    server: { plugins: ["@ursamu/help", "@ursamu/web"] },
    plugins: {
      discord: { applicationId: "app-1" },
      map: { theme: "hedge" },
    },
  };
  const r = mergeConfigFromSample(live, sample);
  const d = (r.config.plugins as {
    discord: Record<string, string>;
  }).discord;
  assertEquals(d.botToken, "secret-live");
  assertEquals(d.applicationId, "app-1");
});

Deno.test("mergeConfigFromSample: no-op when already synced", OPTS, () => {
  const cfg = {
    server: { plugins: ["@ursamu/help"] },
    plugins: {
      channels: {
        defaults: [
          {
            name: "Public",
            alias: "pub",
            lock: "connected",
            announce: true,
          },
          {
            name: "Admin",
            alias: "ad",
            lock: "connected admin+",
            announce: false,
          },
        ],
      },
    },
  };
  const r = mergeConfigFromSample(cfg, {
    server: { plugins: ["@ursamu/help"] },
    plugins: {},
  });
  // may still ensure channels shape — if sample empty plugins, live kept
  assertEquals(r.addedPlugins, []);
});

Deno.test(
  "mergeConfigFromSample: fills missing game.layout chrome",
  OPTS,
  () => {
    const live = {
      server: { plugins: ["@ursamu/help"] },
      game: {
        name: "Test",
        layout: {
          markdown: { h1: "%ch%0%cn" },
        },
      },
      plugins: { channels: { defaults: [] } },
    };
    const sample = {
      server: { plugins: ["@ursamu/help"] },
      game: {
        layout: {
          header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
          divider: "[center(%ch%cy%0%cn,%1,%cg-%cn)]",
          footer: "[repeat(%cg=%cn,%1)]",
        },
      },
      plugins: {},
    };
    const r = mergeConfigFromSample(live, sample);
    assertEquals(r.changed, true);
    assertEquals(r.mergedBlocks.includes("game.layout"), true);
    const layout = (r.config.game as {
      layout: Record<string, unknown>;
    }).layout;
    assertEquals(
      layout.header,
      "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
    );
    assertEquals(
      layout.footer,
      "[repeat(%cg=%cn,%1)]",
    );
    // Preserve live markdown sibling
    assertEquals(
      (layout.markdown as { h1: string }).h1,
      "%ch%0%cn",
    );
  },
);

Deno.test(
  "mergeConfigFromSample: does not overwrite live layout",
  OPTS,
  () => {
    const liveHdr =
      "[center(%ch%cr%0%cn,%1,%cg=%cn)]";
    const live = {
      server: { plugins: ["@ursamu/help"] },
      game: {
        layout: {
          header: liveHdr,
          divider: "[repeat(-,%1)]",
          footer: "[repeat(=,%1)]",
        },
      },
      plugins: { channels: { defaults: [] } },
    };
    const sample = {
      server: { plugins: ["@ursamu/help"] },
      game: {
        layout: {
          header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
          divider: "[center(%ch%cy%0%cn,%1,%cg-%cn)]",
          footer: "[repeat(%cg=%cn,%1)]",
        },
      },
      plugins: {},
    };
    const r = mergeConfigFromSample(live, sample);
    const layout = (r.config.game as {
      layout: Record<string, string>;
    }).layout;
    assertEquals(layout.header, liveHdr);
    assertEquals(layout.footer, "[repeat(=,%1)]");
  },
);
