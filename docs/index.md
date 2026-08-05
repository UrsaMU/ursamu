---
layout: layout.vto
title: UrsaMU — A Modern MUSH Server
description: UrsaMU is a high-performance, modular MU* engine built with TypeScript and Deno. Power the next generation of text-based virtual worlds.
templateEngine: [vto, md]
---

<!-- ── HERO ───────────────────────────────────────────────────────── -->
<div class="home-hero animate-in">
  <p class="home-hero__chip">mush 1.0.30 · cli 0.1.2 · MIT</p>
  <h1>A Modern MUSH Server</h1>
  <p class="home-hero__lede">
    High-performance MU* engine in <strong>TypeScript</strong> and
    <strong>Deno</strong>. WebSocket hub, public portal, staff console,
    sandboxed scripts, JSR plugins.
  </p>
  <div class="home-actions">
    <a href="/guides/installation/" class="btn-primary">Get Started</a>
    <a href="https://github.com/ursamu/ursamu" target="_blank" rel="noopener" class="btn-secondary">GitHub</a>
    <a href="/guides/user-guide/" class="btn-secondary">Read the Docs</a>
  </div>
</div>

<!-- ── QUICK INSTALL ──────────────────────────────────────────────── -->
<section class="home-stack">
  <header class="home-stack__head">
    <p class="home-stack__kicker">Install</p>
    <h2 class="home-stack__title">Quick start</h2>
  </header>
  <div class="home-stack__code">
    <div class="home-stack__code-bar">Terminal</div>
    <pre class="home-stack__pre"><span class="cmt"># Scaffold a game (engine + portal stack)</span>
<span class="cmd">deno run -A jsr:@ursamu/cli@0.1.2/create my-game</span>
<span class="cmd">cd my-game</span>
<span class="cmd">deno task start</span>
<span class="cmt"># http://localhost:4203/  ·  /play  ·  /admin/</span></pre>
  </div>
</section>

<!-- ── CAPABILITIES ──────────────────────────────────────────────── -->
<section class="home-stack" aria-label="Capabilities">
  <header class="home-stack__head">
    <p class="home-stack__kicker">Product</p>
    <h2 class="home-stack__title">Capabilities</h2>
  </header>
  <dl class="home-stack__list">
    <div class="home-stack__row">
      <dt>Transport</dt>
      <dd>WebSocket hub with rate limits — browser play, custom clients, or Telnet</dd>
    </div>
    <div class="home-stack__row">
      <dt>Runtime</dt>
      <dd>Scripts in Web Workers with the full SDK — a bad attr cannot crash the host</dd>
    </div>
    <div class="home-stack__row">
      <dt>Plugins</dt>
      <dd>Typed packages: commands, hooks, flags, routes, namespaced DBO</dd>
    </div>
    <div class="home-stack__row">
      <dt>Front ends</dt>
      <dd><code>@ursamu/site</code> (/play) and <code>@ursamu/web</code> (/admin) on one HTTP port</dd>
    </div>
    <div class="home-stack__row">
      <dt>Database</dt>
      <dd>TypeGraph/PGlite by default, Deno KV fallback — query by flags, owner, data</dd>
    </div>
    <div class="home-stack__row">
      <dt>Softcode</dt>
      <dd>TinyMUX 2.x evaluator — 250+ functions, ANSI, format handler pipeline</dd>
    </div>
    <div class="home-stack__row">
      <dt>Events</dt>
      <dd>Typed GameHooks bus for login, say, move, scenes, and plugin events</dd>
    </div>
    <div class="home-stack__row">
      <dt>Integrations</dt>
      <dd>Optional Discord bridge with reconnect/backoff via JSR</dd>
    </div>
    <div class="home-stack__row">
      <dt>Installs</dt>
      <dd>Fail-fast manifests with semver checks and whole-run rollback</dd>
    </div>
  </dl>
</section>

<!-- ── DOCS DIRECTORY ─────────────────────────────────────────────── -->
<nav class="home-stack" aria-label="Documentation sections">
  <header class="home-stack__head">
    <p class="home-stack__kicker">Documentation</p>
    <h2 class="home-stack__title">Where to go next</h2>
  </header>
  <ul class="home-stack__list home-stack__list--links">
    <li>
      <a href="/guides/installation/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Installation</span>
          <span class="home-stack__desc">Scaffold, start, claim superuser</span>
        </span>
        <span class="home-stack__path">/guides/installation/</span>
      </a>
    </li>
    <li>
      <a href="/guides/user-guide/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Player guide</span>
          <span class="home-stack__desc">Commands, movement, building</span>
        </span>
        <span class="home-stack__path">/guides/user-guide/</span>
      </a>
    </li>
    <li>
      <a href="/guides/admin-guide/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Admin guide</span>
          <span class="home-stack__desc">Staff tools, security, channels</span>
        </span>
        <span class="home-stack__path">/guides/admin-guide/</span>
      </a>
    </li>
    <li>
      <a href="/api/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">API reference</span>
          <span class="home-stack__desc">SDK, REST, hooks, database</span>
        </span>
        <span class="home-stack__path">/api/</span>
      </a>
    </li>
    <li>
      <a href="/plugins/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Plugin development</span>
          <span class="home-stack__desc">addCmd, hooks, routes, DBO</span>
        </span>
        <span class="home-stack__path">/plugins/</span>
      </a>
    </li>
    <li>
      <a href="/development/contributing/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Contributing</span>
          <span class="home-stack__desc">Tests, PRs, conventions</span>
        </span>
        <span class="home-stack__path">/development/contributing/</span>
      </a>
    </li>
  </ul>
</nav>

<!-- ── ARCHITECTURE ──────────────────────────────────────────────── -->
<section class="home-stack" aria-label="Architecture">
  <header class="home-stack__head">
    <p class="home-stack__kicker">System</p>
    <h2 class="home-stack__title">Architecture</h2>
    <p class="home-stack__lede">
      One Deno process stack: game hub, HTTP portal, and Telnet sidecar.
    </p>
  </header>
  <dl class="home-stack__list">
    <div class="home-stack__row">
      <dt>Runtime</dt>
      <dd>Deno · TypeScript · ESM · sandboxed Web Workers</dd>
    </div>
    <div class="home-stack__row">
      <dt>Transport</dt>
      <dd>
        <code>4201</code> telnet ·
        <code>4202</code> ws hub ·
        <code>4203</code> http api + site
      </dd>
    </div>
    <div class="home-stack__row">
      <dt>Engine</dt>
      <dd><code>@ursamu/mush</code> on <code>@ursamu/core</code></dd>
    </div>
    <div class="home-stack__row">
      <dt>Public FE</dt>
      <dd><code>@ursamu/site</code> — portal, skins, <code>/play</code></dd>
    </div>
    <div class="home-stack__row">
      <dt>Staff FE</dt>
      <dd><code>@ursamu/web</code> — console at <code>/admin/</code></dd>
    </div>
    <div class="home-stack__row">
      <dt>Persistence</dt>
      <dd>TypeGraph / PGlite (default) or Deno KV · namespaced DBO</dd>
    </div>
    <div class="home-stack__row">
      <dt>Plugins</dt>
      <dd>JSR packages · help, bbs, mail, wiki, jobs, discord, …</dd>
    </div>
    <div class="home-stack__row">
      <dt>Events</dt>
      <dd>GameHooks bus · supervised restart (<code>exit 75</code>)</dd>
    </div>
  </dl>
</section>

<!-- ── COMMUNITY ─────────────────────────────────────────────────── -->
<section class="home-stack home-stack--end" aria-label="Community">
  <header class="home-stack__head">
    <p class="home-stack__kicker">Community</p>
    <h2 class="home-stack__title">Get involved</h2>
  </header>
  <ul class="home-stack__list home-stack__list--links">
    <li>
      <a href="https://github.com/ursamu/ursamu" class="home-stack__link" target="_blank" rel="noopener">
        <span class="home-stack__meta">
          <span class="home-stack__label">GitHub</span>
          <span class="home-stack__desc">Source, issues, and releases</span>
        </span>
        <span class="home-stack__path">github.com/ursamu/ursamu</span>
      </a>
    </li>
    <li>
      <a href="https://discord.gg/ursamu" class="home-stack__link" target="_blank" rel="noopener">
        <span class="home-stack__meta">
          <span class="home-stack__label">Discord</span>
          <span class="home-stack__desc">Chat with operators and builders</span>
        </span>
        <span class="home-stack__path">discord.gg/ursamu</span>
      </a>
    </li>
    <li>
      <a href="/guides/installation/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Install a game</span>
          <span class="home-stack__desc">Scaffold with the CLI and go live</span>
        </span>
        <span class="home-stack__path">/guides/installation/</span>
      </a>
    </li>
    <li>
      <a href="/development/contributing/" class="home-stack__link">
        <span class="home-stack__meta">
          <span class="home-stack__label">Contribute</span>
          <span class="home-stack__desc">Tests, PRs, and coding conventions</span>
        </span>
        <span class="home-stack__path">/development/contributing/</span>
      </a>
    </li>
  </ul>
</section>
