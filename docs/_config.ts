import lume from "lume/mod.ts";
import markdown from "lume/plugins/markdown.ts";
import metas from "lume/plugins/metas.ts";
import nav from "lume/plugins/nav.ts";
import prism from "lume/plugins/prism.ts";
import search from "lume/plugins/search.ts";
import sitemap from "lume/plugins/sitemap.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import date from "lume/plugins/date.ts";
import vento from "lume/plugins/vento.ts";
import base_path from "lume/plugins/base_path.ts";
import resolve_urls from "lume/plugins/resolve_urls.ts";
import typography from "@tailwindcss/typography";

const site = lume({
  src: "./",
  dest: "_site",
  location: new URL("https://ursamu.github.io/ursamu/"),
});

site
  .use(markdown({
    options: {
      breaks: true,
      typographer: true,
    },
  }))
  .use(metas())
  .use(nav())
  .use(prism())
  .use(search())
  .use(sitemap())
  .use(tailwindcss({
    options: {
      theme: {
        extend: {
          colors: {
            ursamu: {
              bg: "#1a0b2e",
              primary: "#4c1d95",
              accent: "#8b5cf6",
            },
          },
        },
      },
      plugins: [typography],
    },
  }))
  .use(postcss())
  .use(date())
  .use(vento())
  .use(base_path())
  .use(resolve_urls())
  .copy("assets")
  .copy("init.ts")
  .copy("ursamu_github_banner.png")
  .ignore("README.md", "deno.json", "_site", "node_modules");

// Global site data
site.data("site", {
  title: "UrsaMU Documentation",
  description: "UrsaMU — a high-performance, modular MU* engine built with TypeScript and Deno. Documentation for players, admins, and developers.",
  author: "UrsaMU Team",
  lang: "en",
  layout: "layout.vto",
  repository: "https://github.com/ursamu/ursamu",
  theme: "dark",
  nav: [
    { text: "Home", url: "/" },
    { text: "Guides", url: "/guides/" },
    { text: "API", url: "/api/" },
    { text: "Plugins", url: "/plugins/" },
    { text: "Development", url: "/development/" },
  ],
});

export default site;
