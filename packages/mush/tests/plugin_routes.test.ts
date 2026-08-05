/**
 * Plugin route prefix matching — root "/" must not catch-all.
 */
import { assertEquals } from "@std/assert";
import {
  clearPluginRoutes,
  dispatchPluginRoute,
  hasPluginPrefix,
  normalizePluginPrefix,
  pluginPrefixMatches,
  registerPluginRoute,
} from "../src/routes/plugin.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("normalize keeps root slash", OPTS, () => {
  assertEquals(normalizePluginPrefix("/"), "/");
  assertEquals(normalizePluginPrefix("/site/"), "/site");
  assertEquals(normalizePluginPrefix("/admin"), "/admin");
});

Deno.test("root matches only exact /", OPTS, () => {
  assertEquals(pluginPrefixMatches("/", "/"), true);
  assertEquals(pluginPrefixMatches("/admin", "/"), false);
  assertEquals(pluginPrefixMatches("/site/", "/"), false);
  assertEquals(pluginPrefixMatches("/admin", "/admin"), true);
  assertEquals(
    pluginPrefixMatches("/admin/x", "/admin"),
    true,
  );
});

Deno.test(
  "dispatch root does not steal /admin",
  OPTS,
  async () => {
    clearPluginRoutes();
    const hits: string[] = [];
    registerPluginRoute("/admin", async () => {
      hits.push("admin");
      return new Response("admin");
    });
    registerPluginRoute("/", async () => {
      hits.push("root");
      return new Response("root");
    });
    const auth = async () => null;
    const r1 = await dispatchPluginRoute(
      new Request("http://x/"),
      auth,
    );
    assertEquals(await r1!.text(), "root");
    const r2 = await dispatchPluginRoute(
      new Request("http://x/admin/"),
      auth,
    );
    assertEquals(await r2!.text(), "admin");
    assertEquals(hits, ["root", "admin"]);
    assertEquals(hasPluginPrefix("/"), true);
    assertEquals(hasPluginPrefix("/site"), false);
    clearPluginRoutes();
  },
);

Deno.test(
  "plugin routes live on globalThis (dual-import safe)",
  OPTS,
  () => {
    clearPluginRoutes();
    registerPluginRoute("/site", async () => new Response("ok"));
    const key = Symbol.for("ursamu.mush.pluginRoutes");
    const g = globalThis as unknown as Record<
      symbol,
      Map<string, unknown>
    >;
    assertEquals(g[key]?.has("/site"), true);
    assertEquals(hasPluginPrefix("/site"), true);
    clearPluginRoutes();
    assertEquals(g[key]?.has("/site"), false);
  },
);
