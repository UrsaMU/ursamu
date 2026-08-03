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
  const court = resolveSkinHref({ skin: "court" });
  assertEquals(court.startsWith("/site/css/skins/court.css"), true);
  assertEquals(
    resolveSkinHref({ skinCss: "/site/theme/a.css", skin: "court" })
      .startsWith("/site/theme/a.css"),
    true,
  );
  assertEquals(
    resolveSkinHref({ skin: "/abs.css" }),
    "/abs.css",
  );
});

Deno.test("applySkinDefaults: court banner + title", OPTS, () => {
  const d = applySkinDefaults({ skin: "court" });
  assertEquals(d.title, "Court of Miracles");
  assertEquals(
    d.bannerImage,
    "/site/skins/court/imgs/header.png",
  );
  assertEquals(d.nav?.length, 4);
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
      skin: "court",
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
    title: "Court of Miracles",
    bannerImage: "/site/skins/court/imgs/header.png",
    nav: [
      { label: "Home", href: "/site/", active: true },
      { label: "Wiki", href: "#" },
    ],
  });

  assertEquals(out.includes('data-skin="court"'), true);
  assertEquals(out.includes("<title>Court of Miracles</title>"), true);
  assertEquals(
    out.includes("/site/css/skins/court.css"),
    true,
  );
  assertEquals(
    out.includes('src="/site/skins/court/imgs/header.png"'),
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
