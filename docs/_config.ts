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
import nunjucks from "lume/plugins/nunjucks.ts";

const site = lume({
  src: "./",
  dest: "./_site",
  location: new URL("https://ursamu.github.io/"),
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
  .use(tailwindcss())
  .use(postcss())
  .use(date())
  .use(nunjucks())
  .copy("assets")
  .copy("assets/css")
  .ignore("README.md", "deno.json", "_site", "node_modules", "scripts");

// Global site data
site.data("site", {
  title: "UrsaMU Documentation",
  description: "Documentation for UrsaMU, a modern MU* server built with Deno",
  author: "UrsaMU Team",
  lang: "en",
  repository: "https://github.com/lcanady/ursamu",
  theme: "dark",
  nav: [
    { text: "Home", url: "/" },
    { text: "Guides", url: "/guides/" },
    { text: "Configuration", url: "/configuration/" },
    { text: "API Reference", url: "/api/" },
    { text: "Plugins", url: "/plugins/" },
    { text: "Development", url: "/development/" },
  ],
});

export default site; 