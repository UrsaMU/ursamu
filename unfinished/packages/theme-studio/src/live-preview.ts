/**
 * Live site.js preview shell + fixture APIs (Phase 1).
 */

import { join } from "@std/path";
import { existsSync } from "@std/fs";

export type LiveManifest = {
  id: string;
  title: string;
  plainBg: boolean;
  bannerImage?: string;
};

/** Inject draft skin + preview bridge into public/index.html */
export function buildLiveShellHtml(
  indexHtml: string,
  m: LiveManifest,
): string {
  let html = indexHtml;
  const title = m.title || "Theme preview";
  const id = m.id || "draft";

  html = html.replace(/data-skin="[^"]*"/, `data-skin="${id}"`);
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(title)} · live preview</title>`,
  );
  // Point skin at draft CSS endpoint
  html = html.replace(
    /href="\/site\/css\/skins\/default\.css[^"]*"/,
    'href="/api/draft.css"',
  );
  // Also absolute /site/ paths work when page is under /live/
  html = html.replace(
    /(href|src)="\/site\//g,
    '$1="/shell/',
  );
  // Fix: we rewrote skin to /api/draft.css already; shell css should stay
  // Re-map shell assets — index uses /site/css → serve as /shell/css
  // But draft.css must remain /api/draft.css
  html = html.replace(
    'href="/shell/api/draft.css"',
    'href="/api/draft.css"',
  );

  if (!/data-site-config=/.test(html)) {
    html = html.replace(
      "<html ",
      `<html data-site-config="/live/config.json" `,
    );
  } else {
    html = html.replace(
      /data-site-config="[^"]*"/,
      'data-site-config="/live/config.json"',
    );
  }

  if (m.plainBg) {
    html = html.replace(
      'class="site-shell"',
      'class="site-shell is-plain"',
    );
  }

  // Live-update bridge for parent studio postMessage
  const bridge = `
<script>
(function () {
  function applyCss(css) {
    var el = document.getElementById("ursamu-live-draft");
    if (!el) {
      el = document.createElement("style");
      el.id = "ursamu-live-draft";
      document.head.appendChild(el);
    }
    el.textContent = css || "";
    // also refresh link cache-bust
    var skin = document.querySelector("[data-site-skin]");
    if (skin) {
      var u = new URL(skin.href, location.href);
      u.searchParams.set("t", String(Date.now()));
      skin.href = u.pathname + u.search;
    }
  }
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "ursamu-theme-draft") return;
    if (typeof d.css === "string") applyCss(d.css);
  });
  // Ask parent for latest draft
  try {
    parent.postMessage({ type: "ursamu-theme-ready" }, "*");
  } catch (e) {}
})();
</script>`;
  html = html.replace("</body>", bridge + "\n  </body>");

  return html;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function liveConfigJson(m: LiveManifest): Record<string, unknown> {
  const banner = m.bannerImage
    ? `/draft/assets/${m.bannerImage.replace(/^\/+/, "")}`
    : undefined;
  return {
    title: m.title || "Theme preview",
    skin: m.id || "draft",
    skinCss: "/api/draft.css",
    skinHref: "/api/draft.css",
    bannerImage: banner,
    plainBg: m.plainBg !== false,
    telnet: "preview.local:4201",
    nav: [
      { id: "home", label: "Home", href: "/live/", order: 10 },
      { id: "wiki", label: "Wiki", href: "/live/wiki/", order: 20 },
      { id: "help", label: "Help", href: "/live/help/", order: 30 },
      {
        id: "login",
        label: "Log in",
        href: "/live/login",
        order: 40,
      },
    ],
    leftMenu: `## Featured
[[featured]]

## Preview
- [Home](/live/)
- [Wiki](/live/wiki/)
- [Help](/live/help/)
- [Log in](/live/login)

## Related
[[section]]
`,
    menuBlocks: {},
    gen: Date.now(),
  };
}

/** Minimal fixture wiki/help for live site.js */
export function liveWikiHomeBody(): string {
  return `# Live preview

This iframe runs real **site.js** against your draft skin.

## Checklist

- Nav active states and brand color
- Left **Featured** menu
- Body prose, [links](/live/wiki/lore), \`code\`
- Tables and help chrome

> Blockquote sample

| Token | Check |
|-------|-------|
| accent | links |
| surface | cards |

Open [Wiki](/live/wiki/) · [Help](/live/help/) · [Login](/live/login).
`;
}

export function liveWikiList() {
  return [
    {
      path: "lore",
      title: "Lore sample",
      type: "place",
      featured: true,
      tags: ["lore"],
      draft: false,
    },
    {
      path: "meta/faq",
      title: "FAQ",
      type: "meta",
      featured: true,
      tags: ["meta"],
      draft: false,
    },
  ];
}

export function liveWikiPage(path: string): Record<string, unknown> | null {
  if (path === "home") {
    return {
      path: "home",
      title: "Live preview",
      body: liveWikiHomeBody(),
      type: "page",
    };
  }
  if (path === "lore") {
    return {
      path: "lore",
      title: "Lore sample",
      body: "## Lore\n\nFeatured wiki page for left-rail testing.\n",
      type: "place",
      featured: true,
    };
  }
  if (path === "meta/faq") {
    return {
      path: "meta/faq",
      title: "FAQ",
      body: "## FAQ\n\nSample answers for TOC and prose.\n\n### Nested\n\nMore text.\n",
      type: "meta",
      featured: true,
    };
  }
  return null;
}

export function liveHelpIndex() {
  return {
    sections: ["general"],
    topics: [
      {
        name: "+look",
        path: "look",
        section: "general",
        sample: "Examine the room.",
        num: "1.01",
      },
    ],
    staff: false,
  };
}

export function liveHelpTopic(path: string) {
  if (path !== "look") return null;
  return {
    entry: {
      name: "+look",
      section: "general",
      path: "look",
      content: "## Syntax\n\n```\n+look\n+look <name>\n```\n\nExamine the room or a target.\n",
    },
  };
}

export function rewriteSiteJsForLive(js: string): string {
  // site.js fetches /api/v1/* and /site/config.json — ok if we mount those.
  // publicBase() uses /live prefix when path starts with /live
  // Paths like /live/wiki work with detectMode if we add live prefix support.
  // Easier: serve live shell at /live/ but make pathname look like /site/
  // Actually site.js detectMode checks /site/wiki and /wiki.
  // We'll serve SPA at /live/* and patch nothing if we also alias:
  //   /live/ → home as pathname /live or /live/
  // detectMode: pathname === "/live" → not home.
  //
  // Inject a tiny prefix rewrite at the top of site.js for preview.
  const patch = `
/* ursamu theme-studio live patch */
(function(){
  var _ps = history.pushState.bind(history);
  var _rs = history.replaceState.bind(history);
  function norm(u){
    try {
      var x = new URL(u, location.origin);
      if (x.pathname.indexOf("/live") === 0) {
        var rest = x.pathname.slice(5) || "/";
        if (rest.charAt(0) !== "/") rest = "/" + rest;
        x.pathname = "/site" + (rest === "/" ? "/" : rest);
        return x.pathname + x.search + x.hash;
      }
    } catch(e) {}
    return u;
  }
  // Expose for debugging
  window.__ursamuLiveNorm = norm;
})();
`;
  // Better approach: rewrite detectMode paths by serving under /site/ for live
  // Use /site/ for live shell entirely — studio already uses / for grapes UI.
  // Live iframe src = /site/ with draft skin. Conflict: /site/css is shell.
  // Current: /shell/ for assets. Live at /preview/ with patched html using /shell/.
  return js; // keep unpatched; use /site/ mount for live below
}
