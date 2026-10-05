/**
 * Frozen shell markup samples for GrapesJS (layout switcher).
 * Structure matches @ursamu/site — not editable as layout.
 */

export type CanvasLayout =
  | "home"
  | "wiki"
  | "article"
  | "help"
  | "login";

export const CANVAS_LAYOUTS: readonly {
  id: CanvasLayout;
  label: string;
  livePath: string;
}[] = [
  { id: "home", label: "Home", livePath: "/site/" },
  { id: "wiki", label: "Wiki index", livePath: "/site/wiki/" },
  { id: "article", label: "Wiki article", livePath: "/site/wiki/lore" },
  { id: "help", label: "Help", livePath: "/site/help/" },
  { id: "login", label: "Login", livePath: "/site/login" },
] as const;

export function isCanvasLayout(v: string): v is CanvasLayout {
  return CANVAS_LAYOUTS.some((l) => l.id === v);
}

export function canvasShellHtml(opts: {
  title: string;
  brand: string;
  layout?: CanvasLayout;
}): string {
  const title = escapeHtml(opts.title);
  const brand = escapeHtml(opts.brand);
  const layout = opts.layout && isCanvasLayout(opts.layout)
    ? opts.layout
    : "home";

  if (layout === "login") {
    return loginShell(brand, title);
  }

  const nav = shellNav(brand, layout);
  const banner = layout === "home"
    ? homeBanner(title)
    : compactBanner(layoutLabel(layout));

  const shellMods = layout === "home"
    ? "site-shell"
    : "site-shell is-plain is-compact is-mode-no-hero" +
      (layout === "wiki" || layout === "article"
        ? " is-mode-wiki"
        : layout === "help"
        ? " is-mode-help"
        : "");

  return `<!-- ursamu-shell layout=${layout} -->
<div class="${shellMods}" data-site-shell id="wrapper" data-layout="${layout}">
  ${nav}
  ${banner}
  <div class="site-body" id="container">
    ${leftAside(layout)}
    <main class="site-main" id="center" data-site-main>
      ${mainFor(layout, title)}
      ${footer()}
    </main>
    ${rightAside(layout)}
  </div>
</div>`;
}

function layoutLabel(layout: CanvasLayout): string {
  return CANVAS_LAYOUTS.find((l) => l.id === layout)?.label ?? layout;
}

function shellNav(brand: string, layout: CanvasLayout): string {
  const a = (id: CanvasLayout, label: string, href: string) => {
    const active = layout === id ||
      (id === "wiki" && layout === "article");
    return `<li><a href="${href}" class="${
      active ? "is-active" : ""
    }" data-layout-link="${id}">${label}</a></li>`;
  };
  return `
  <nav class="site-nav" data-site-nav aria-label="Primary">
    <a class="site-nav__brand" data-site-brand data-bind="label" href="#home">${brand}</a>
    <ul class="site-nav__list" data-site-nav-list>
      ${a("home", "Home", "#home")}
      ${a("wiki", "Wiki", "#wiki")}
      ${a("help", "Help", "#help")}
      ${a("login", "Log in", "#login")}
    </ul>
  </nav>`;
}

function homeBanner(title: string): string {
  return `
  <header class="site-banner" data-site-banner>
    <h1 class="site-banner__title" data-site-banner-title data-bind="title">${title}</h1>
    <a class="site-banner__connect" href="#">preview.local:4201</a>
  </header>`;
}

function compactBanner(label: string): string {
  // Compact modes hide hero; keep a slim title strip for styling
  return `
  <header class="site-banner" data-site-banner hidden>
    <h1 class="site-banner__title">${escapeHtml(label)}</h1>
  </header>`;
}

function leftAside(layout: CanvasLayout): string {
  if (layout === "login") return "";
  const searchPh = layout === "help" ? "Search help…" : "Search wiki…";
  if (layout === "help") {
    return `
    <aside class="site-aside site-aside--start" id="left"
      aria-label="Sidebar">
      <form class="site-search" role="search" onsubmit="return false">
        <input class="site-search__input" type="search"
          placeholder="${searchPh}" />
        <button type="submit" class="site-search__btn" aria-label="Search">
          <span class="site-search__btn-icon"></span>
        </button>
      </form>
      <nav class="site-menu" aria-label="Help sections">
        <h2 class="site-menu__title">Sections</h2>
        <ul class="site-menu__list">
          <li class="is-current"><a href="#">general</a></li>
          <li><a href="#">chargen</a></li>
        </ul>
      </nav>
      <nav class="site-menu" aria-label="Topics">
        <h2 class="site-menu__title">Topics</h2>
        <ul class="site-menu__list">
          <li class="is-current"><a href="#">+look</a></li>
          <li><a href="#">+sheet</a></li>
        </ul>
      </nav>
    </aside>`;
  }
  return `
    <aside class="site-aside site-aside--start" id="left"
      aria-label="Sidebar">
      <form class="site-search" role="search" onsubmit="return false">
        <input class="site-search__input" type="search"
          placeholder="${searchPh}" />
        <button type="submit" class="site-search__btn" aria-label="Search">
          <span class="site-search__btn-icon"></span>
        </button>
      </form>
      <nav class="site-menu" aria-label="Featured">
        <h2 class="site-menu__title">Featured</h2>
        <ul class="site-menu__list">
          <li class="${
    layout === "article" ? "is-current" : ""
  }"><a href="#article">Night City</a></li>
          <li><a href="#">Chargen FAQ</a></li>
          <li><a href="#">Staff notes</a></li>
        </ul>
      </nav>
      <nav class="site-menu" aria-label="Related">
        <h2 class="site-menu__title">Related</h2>
        <ul class="site-menu__list">
          <li><a href="#wiki">Wiki index</a></li>
          <li><a href="#home">Home</a></li>
        </ul>
      </nav>
    </aside>`;
}

function rightAside(layout: CanvasLayout): string {
  if (layout === "login") return "";
  if (layout === "wiki") {
    return `
    <aside class="site-aside site-aside--end" id="right"
      aria-label="Complementary">
      <nav class="site-menu" aria-label="Tips">
        <h2 class="site-menu__title">Tips</h2>
        <ul class="site-menu__list">
          <li><a href="#">Use search</a></li>
          <li><a href="#">Featured pages</a></li>
        </ul>
      </nav>
    </aside>`;
  }
  return `
    <aside class="site-aside site-aside--end" id="right"
      aria-label="Complementary">
      <nav class="site-menu" aria-label="On this page">
        <h2 class="site-menu__title">On this page</h2>
        <ul class="site-menu__list">
          <li><a href="#" class="is-active">Overview</a></li>
          <li class="toc-sub"><a href="#">Section</a></li>
          <li class="toc-sub"><a href="#">Details</a></li>
        </ul>
      </nav>
    </aside>`;
}

function footer(): string {
  return `
      <footer class="site-footer" id="footer">
        <div class="site-rule site-rule--image" role="presentation"></div>
        <p>
          Theme studio ·
          <a href="https://github.com/UrsaMU/ursamu">UrsaMU</a>
        </p>
      </footer>`;
}

function mainFor(layout: CanvasLayout, title: string): string {
  if (layout === "wiki") return wikiIndexMain();
  if (layout === "article") return articleMain();
  if (layout === "help") return helpMain();
  return homeMain(title);
}

function homeMain(title: string): string {
  return `
      <section class="site-section">
        <h2 class="site-section__title">Theme element gallery</h2>
        <div class="site-rule site-rule--image" role="presentation"></div>
        <div class="site-section__body">
          <p>
            Home layout for <strong data-bind="title">${title}</strong>. Body text with a
            <a href="#">text link</a>, <em>emphasis</em>, and
            inline <code>code_span</code>.
          </p>
          <h2>Heading level 2</h2>
          <h3>Heading level 3</h3>
          <blockquote>
            <p>Blockquote — pull quotes and callouts.</p>
          </blockquote>
          <pre><code>function roll(n) {
  return 1 + Math.floor(Math.random() * n);
}</code></pre>
          <ul>
            <li>Unordered item</li>
            <li>Nested
              <ul><li>Child A</li><li>Child B</li></ul>
            </li>
          </ul>
          <table>
            <thead>
              <tr><th>Stat</th><th>Value</th><th>Notes</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>INT</code></td><td>6</td><td>Sample</td>
              </tr>
              <tr>
                <td><code>REF</code></td><td>8</td><td>Sample</td>
              </tr>
            </tbody>
          </table>
          <p>
            <span class="site-badge">badge</span>
            <span class="site-badge">staff</span>
          </p>
        </div>
      </section>`;
}

function wikiIndexMain(): string {
  return `
      <section class="site-section">
        <h2 class="site-section__title">Wiki</h2>
        <div class="site-rule site-rule--image" role="presentation"></div>
        <div class="site-section__body">
          <p>Directory listing layout (compact shell, no hero).</p>
          <div class="site-wiki-table-wrap">
            <table class="site-wiki-table">
              <thead>
                <tr>
                  <th>Page</th><th>Type</th><th></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><a href="#article">Night City</a></td>
                  <td class="site-wiki-type"><code>place</code></td>
                  <td class="site-wiki-open">
                    <a class="site-wiki-open-link" href="#article">Open</a>
                  </td>
                </tr>
                <tr>
                  <td><a href="#">Chargen FAQ</a></td>
                  <td class="site-wiki-type"><code>meta</code></td>
                  <td class="site-wiki-open">
                    <a class="site-wiki-open-link" href="#">Open</a>
                  </td>
                </tr>
                <tr>
                  <td><a href="#">Staff notes</a></td>
                  <td class="site-wiki-type"><code>page</code></td>
                  <td class="site-wiki-open">
                    <a class="site-wiki-open-link" href="#">Open</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
}

function articleMain(): string {
  return `
      <section class="site-section">
        <h2 class="site-section__title">Night City</h2>
        <div class="site-rule site-rule--image" role="presentation"></div>
        <div class="site-section__body">
          <p class="site-help-crumb">
            <a href="#wiki">Wiki</a> / place / Night City
          </p>
          <h2>Overview</h2>
          <p>
            Sample <strong>featured</strong> wiki article. Compact chrome,
            TOC on the right, Related in the left rail.
          </p>
          <h3>Districts</h3>
          <ul>
            <li>Watson</li>
            <li>Westbrook</li>
            <li>Heywood</li>
          </ul>
          <h3>See also</h3>
          <p><a href="#wiki">Back to wiki index</a></p>
          <blockquote>
            <p>Pull quote from lore text.</p>
          </blockquote>
        </div>
      </section>`;
}

function helpMain(): string {
  return `
      <section class="site-section">
        <p class="site-help-crumb">
          <a href="#help">Help</a> / general / +look
        </p>
        <h2 class="site-section__title">+look</h2>
        <div class="site-rule site-rule--image" role="presentation"></div>
        <div class="site-section__body site-help-body">
          <p class="site-help-meta">
            Category: general
            <span class="site-help-count">12</span>
          </p>
          <h3>Syntax</h3>
          <pre><code>+look
+look &lt;name&gt;
+look/me</code></pre>
          <h3>Description</h3>
          <p>
            Examine the room or a named target. Help topic body uses
            <code>site-help-body</code> chrome.
          </p>
          <table>
            <thead>
              <tr><th>#</th><th>Topic</th><th>Sample</th><th></th></tr>
            </thead>
            <tbody>
              <tr>
                <td class="site-help-num">1.01</td>
                <td><a href="#">+look</a></td>
                <td class="site-help-sample">Examine the room.</td>
                <td class="site-help-open">
                  <a class="site-help-open-link" href="#">Open</a>
                </td>
              </tr>
              <tr>
                <td class="site-help-num">1.02</td>
                <td><a href="#">+sheet</a></td>
                <td class="site-help-sample">Show your sheet.</td>
                <td class="site-help-open">
                  <a class="site-help-open-link" href="#">Open</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>`;
}

function loginShell(brand: string, title: string): string {
  return `<!-- ursamu-shell layout=login -->
<div class="site-shell is-plain is-compact is-mode-no-hero is-mode-login"
  data-site-shell id="wrapper" data-layout="login">
  <nav class="site-nav" data-site-nav aria-label="Primary">
    <a class="site-nav__brand" data-site-brand data-bind="label" href="#home">${brand}</a>
    <ul class="site-nav__list" data-site-nav-list>
      <li><a href="#home">Home</a></li>
      <li><a href="#wiki">Wiki</a></li>
      <li><a href="#help">Help</a></li>
      <li><a href="#login" class="is-active">Log in</a></li>
    </ul>
  </nav>
  <header class="site-banner" data-site-banner hidden></header>
  <div class="site-body" id="container">
    <main class="site-main" id="center" data-site-main>
      <div class="site-gate" style="max-width:24rem;margin:2rem auto">
        <div class="site-gate-card">
          <header>
            <p class="site-gate-kicker">Public site</p>
            <h1>Sign in</h1>
            <p class="site-gate-lede">
              Login layout for <strong data-bind="title">${title}</strong> —
              gate card, tabs, fields, buttons.
            </p>
          </header>
          <div class="site-auth-tabs">
            <button type="button" class="site-auth-tab is-active">
              Log in
            </button>
            <button type="button" class="site-auth-tab">
              Register
            </button>
          </div>
          <form class="site-auth-form" onsubmit="return false">
            <div class="site-auth-field">
              <label class="site-auth-label">Character</label>
              <input class="site-auth-input" type="text"
                value="Preview" />
            </div>
            <div class="site-auth-field">
              <label class="site-auth-label">Password</label>
              <input class="site-auth-input" type="password"
                value="••••••••" />
            </div>
            <p class="site-auth-error">Sample error message.</p>
            <button type="submit" class="site-auth-submit">
              Enter game
            </button>
          </form>
          <div class="site-gate-actions" style="margin-top:1rem">
            <button type="button"
              class="site-gate-btn site-gate-btn--primary">
              Primary
            </button>
            <button type="button" class="site-gate-btn">
              Secondary
            </button>
          </div>
        </div>
      </div>
      ${footer()}
    </main>
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
