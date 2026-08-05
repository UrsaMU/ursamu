import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  applySkinDefaults,
  markNavActive,
  navHrefIsActive,
  normalizeMount,
  normalizeNavPath,
  readSiteConfig,
  resolveSkinHref,
} from "../src/config.ts";
import { injectSiteHtml } from "../src/html.ts";
import { SITE_ASSET_V } from "../src/config.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("normalizeMount", OPTS, () => {
  assertEquals(normalizeMount(undefined), "/site");
  assertEquals(normalizeMount("/fe/"), "/fe");
  assertEquals(normalizeMount("portal"), "/portal");
});

Deno.test("readSiteConfig: skinCss wins fields", OPTS, () => {
  const c = readSiteConfig({
    plugins: {
      site: {
        skin: "default",
        skinCss: "/theme/x.css",
        title: "Court",
        bannerImage: "/img/h.png",
        serveRoot: true,
        themeDir: "theme",
        nav: [{ label: "Home", href: "/", active: true }],
      },
    },
  });
  assertEquals(c.skin, "default");
  assertEquals(c.skinCss, "/theme/x.css");
  assertEquals(c.title, "Court");
  assertEquals(c.bannerImage, "/img/h.png");
  assertEquals(c.serveRoot, true);
  assertEquals(c.themeDir, "theme");
  assertEquals(c.nav?.length, 1);
  assertEquals(c.nav?.[0]?.label, "Home");
});

Deno.test("readSiteConfig: empty", OPTS, () => {
  assertEquals(readSiteConfig({}), {});
  assertEquals(readSiteConfig(null), {});
});

Deno.test("resolveSkinHref", OPTS, () => {
  const def = resolveSkinHref({ skin: "default" });
  assertEquals(def.startsWith("/site/css/skins/default.css"), true);
  assertEquals(
    resolveSkinHref({
      skinCss: "/site/theme/installed/court/site.css",
      skin: "court",
    }).startsWith("/site/theme/installed/court/site.css"),
    true,
  );
  assertEquals(
    resolveSkinHref({ skin: "/abs.css" }),
    "/abs.css",
  );
});

Deno.test("applySkinDefaults: no brand auto-fill", OPTS, () => {
  // Court is installable — named skin alone does not inject brand.
  const d = applySkinDefaults({ skin: "court" });
  assertEquals(d.title, undefined);
  assertEquals(d.bannerImage, undefined);
  assertEquals(d.nav?.length, 3);
  assertEquals(d.nav?.[2]?.label, "Help");
  assertEquals(d.nav?.[2]?.href, "/site/help/");
});

Deno.test("applySkinDefaults: default untouched", OPTS, () => {
  const d = applySkinDefaults({ skin: "default", title: "X" });
  assertEquals(d.title, "X");
  assertEquals(d.bannerImage, undefined);
});

Deno.test(
  "applySkinDefaults: empty title/banner stay hidden",
  OPTS,
  () => {
    const d = applySkinDefaults({
      skin: "default",
      title: "",
      bannerImage: "",
    });
    assertEquals(d.title, "");
    assertEquals(d.bannerImage, "");
  },
);

Deno.test("navHrefIsActive: home vs login", OPTS, () => {
  assertEquals(normalizeNavPath("/site/"), "/site");
  assertEquals(normalizeNavPath("/site/login"), "/site/login");
  assertEquals(navHrefIsActive("/site/", "/site/"), true);
  assertEquals(navHrefIsActive("/site/", "/site/login"), false);
  assertEquals(navHrefIsActive("/site/login", "/site/login"), true);
  assertEquals(navHrefIsActive("#", "/site/"), false);
  assertEquals(
    navHrefIsActive("/site/wiki", "/site/wiki/lore"),
    true,
  );
  const marked = markNavActive(
    [
      { label: "Home", href: "/site/", active: true },
      { label: "Wiki", href: "/site/wiki" },
    ],
    "/site/login",
  );
  assertEquals(marked[0].active, false);
  assertEquals(marked[1].active, false);
});

Deno.test("injectSiteHtml: skin + title", OPTS, () => {
  const src = `<!DOCTYPE html>
<html lang="en" data-skin="default">
<head>
  <title>UrsaMU</title>
  <link rel="stylesheet" href="/site/css/skins/default.css" data-site-skin />
</head>
<body>
  <div class="site-shell" data-site-shell id="wrapper">
    <nav data-site-nav>
      <a class="site-nav__brand" data-site-brand href="/">UrsaMU</a>
      <ul class="site-nav__list" data-site-nav-list>
        <li><a href="/" class="is-active">Home</a></li>
      </ul>
    </nav>
    <header class="site-banner" data-site-banner>
      <h1 class="site-banner__title" data-site-banner-title>UrsaMU</h1>
      <img class="site-banner__img" data-site-banner-img alt="" hidden />
    </header>
  </div>
</body>
</html>`;

  const out = injectSiteHtml(src, {
    skin: "court",
    skinCss: "/site/theme/installed/court/site.css",
    title: "Court of Miracles",
    bannerImage: "/site/theme/installed/court/imgs/header.png",
    nav: [
      { label: "Home", href: "/site/", active: true },
      { label: "Wiki", href: "#" },
    ],
  });

  assertEquals(out.includes('data-skin="custom"'), true);
  assertEquals(out.includes("<title>Court of Miracles</title>"), true);
  assertEquals(
    out.includes("/site/theme/installed/court/site.css"),
    true,
  );
  assertEquals(
    out.includes('src="/site/theme/installed/court/imgs/header.png"'),
    true,
  );
  assertEquals(out.includes("has-image"), true);
  assertEquals(out.includes(">Wiki</a>"), true);
  assertEquals(out.includes("Court of Miracles</a>"), true);

  const onLogin = injectSiteHtml(src, {
    skin: "court",
    title: "Court of Miracles",
    nav: [
      { label: "Home", href: "/site/", active: true },
      { label: "Wiki", href: "#" },
    ],
  }, { path: "/site/login" });
  assertEquals(
    onLogin.includes('href="/site/" class="is-active"'),
    false,
  );
  assertEquals(onLogin.includes('href="/site/"'), true);

  const onHome = injectSiteHtml(src, {
    skin: "court",
    title: "Court of Miracles",
    nav: [
      { label: "Home", href: "/site/" },
      { label: "Wiki", href: "#" },
    ],
  }, { path: "/site/" });
  assertEquals(
    onHome.includes('href="/site/" class="is-active"'),
    true,
  );

  // No image + no title → compact shell (Figma no-banner)
  const compact = injectSiteHtml(src, {
    skin: "default",
    title: "",
    bannerImage: "",
  });
  assertEquals(compact.includes("is-compact"), true);
  assertEquals(
    /data-site-banner-title[^>]*\bhidden\b/i.test(compact),
    true,
  );

  // Title without image → not compact (hero H1 stays)
  const titled = injectSiteHtml(src, {
    skin: "default",
    title: "My MUSH",
  });
  assertEquals(titled.includes("is-compact"), false);
  assertEquals(titled.includes("My MUSH"), true);
});

Deno.test("injectSiteHtml: asset v rewrite", OPTS, () => {
  const src = `<link href="/site/css/tokens.css?v=stale" />
<link data-site-skin href="/site/css/skins/old.css?v=stale" />
<script src="/site/js/site.js?v=stale"></script>`;
  const out = injectSiteHtml(src, { skin: "default" });
  assertEquals(out.includes("?v=stale"), false);
  assertEquals(out.includes(`?v=${SITE_ASSET_V}`), true);
});

Deno.test("injectSiteHtml: telnet under title", OPTS, () => {
  const src = `<header data-site-banner>
  <h1 data-site-banner-title hidden></h1>
  <a data-site-banner-connect hidden></a>
</header>`;
  const withBoth = injectSiteHtml(src, {
    title: "Court of Miracles",
    telnet: "court.ursamu.io:4201",
  });
  assertEquals(withBoth.includes("court.ursamu.io:4201"), true);
  assertEquals(withBoth.includes('href="telnet://court.ursamu.io:4201"'), true);
  assertEquals(withBoth.includes("data-site-banner-connect hidden"), false);

  const noTitle = injectSiteHtml(src, {
    title: "",
    telnet: "court.ursamu.io:4201",
  });
  assertEquals(
    /data-site-banner-connect[^>]*\bhidden\b/i.test(noTitle),
    true,
  );
});
