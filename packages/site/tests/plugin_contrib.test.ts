import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import {
  clearSiteMenuBlocks,
  expandLeftMenuTemplate,
  registerSiteMenuBlock,
} from "../src/menu.ts";
import {
  clearSiteNav,
  listSiteNav,
  mergeSiteNav,
  registerSiteNav,
  unregisterSiteNav,
} from "../src/site-nav.ts";
import {
  clearSiteStatic,
  isSiteStaticId,
  registerSiteStatic,
  safeJoinSiteStatic,
  getSiteStaticRoot,
  unregisterSiteStatic,
} from "../src/site-static.ts";
import { fromFileUrl } from "jsr:@std/path@^0.224.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("registerSiteNav + merge: config wins id", OPTS, () => {
  clearSiteNav();
  registerSiteNav({
    id: "events",
    label: "Events (plugin)",
    href: "/site/p/events/",
    order: 40,
  });
  registerSiteNav({
    id: "home",
    label: "Home",
    href: "/site/",
    order: 10,
  });
  assertEquals(listSiteNav().length, 2);

  const merged = mergeSiteNav(
    [
      {
        id: "events",
        label: "Calendar",
        href: "/site/wiki/events",
        order: 20,
      },
    ],
    listSiteNav(),
  );
  const events = merged.find((n) => n.id === "events");
  assertEquals(events?.label, "Calendar");
  assertEquals(events?.href, "/site/wiki/events");
  assertEquals(merged.some((n) => n.id === "home"), true);
  clearSiteNav();
});

Deno.test("registerSiteNav: rejects bad id", OPTS, () => {
  clearSiteNav();
  registerSiteNav({
    id: "../x",
    label: "X",
    href: "/site/",
  });
  assertEquals(listSiteNav().length, 0);
  unregisterSiteNav("nope");
  clearSiteNav();
});

Deno.test("expandLeftMenuTemplate: blocks + static", OPTS, () => {
  clearSiteMenuBlocks();
  registerSiteMenuBlock("plug", () => ({
    items: [{ label: "A", href: "/site/p/a/" }],
  }));
  // resolve is async; expand uses pre-built blocks map
  const html = expandLeftMenuTemplate({
    template: `## Plug
[[plug]]

## Links
- [Home](/site/)
`,
    blocks: {
      plug: {
        items: [{ label: "A", href: "/site/p/a/" }],
      },
    },
  });
  assertStringIncludes(html, "Plug");
  assertStringIncludes(html, 'href="/site/p/a/"');
  assertStringIncludes(html, "Home");
  assertStringIncludes(html, 'href="/site/"');
  clearSiteMenuBlocks();
});

Deno.test("expandLeftMenuTemplate: empty block drops heading", OPTS, () => {
  const html = expandLeftMenuTemplate({
    template: `## Empty
[[missing]]

## Ok
- [X](/site/)
`,
    blocks: {},
  });
  assertEquals(html.includes("Empty"), false);
  assertStringIncludes(html, "Ok");
});

Deno.test("registerSiteStatic: id + path safety", OPTS, () => {
  clearSiteStatic();
  assertEquals(isSiteStaticId("css"), false);
  assertEquals(isSiteStaticId("my-tool"), true);

  const root = fromFileUrl(new URL("./", import.meta.url));
  assertEquals(
    registerSiteStatic({ id: "css", root }),
    false,
  );
  assertEquals(
    registerSiteStatic({ id: "mytool", root }),
    true,
  );
  assertEquals(getSiteStaticRoot("mytool"), root);

  assertEquals(safeJoinSiteStatic(root, "../etc/passwd"), null);
  assertEquals(
    safeJoinSiteStatic(root, "plugin_contrib.test.ts") !== null,
    true,
  );

  unregisterSiteStatic("mytool");
  assertEquals(getSiteStaticRoot("mytool"), null);
  clearSiteStatic();
});

Deno.test("registerSiteStatic: file URL root", OPTS, () => {
  clearSiteStatic();
  const url = new URL("./", import.meta.url);
  assertEquals(
    registerSiteStatic({ id: "fixture", root: url }),
    true,
  );
  const abs = getSiteStaticRoot("fixture");
  assertEquals(typeof abs, "string");
  assertEquals(
    safeJoinSiteStatic(abs!, "plugin_contrib.test.ts")?.endsWith(
      "plugin_contrib.test.ts",
    ),
    true,
  );
  clearSiteStatic();
});
