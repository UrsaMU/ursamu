---
layout: layout.vto
title: UrsaMU — A Modern MUSH Server
description: UrsaMU is a high-performance, modular MU* engine built with TypeScript and Deno. Power the next generation of text-based virtual worlds.
templateEngine: [vto, md]
---

<!-- ── HERO ───────────────────────────────────────────────────────── -->
<div class="home-hero animate-in">

  <div class="version-badge" style="cursor:default">
    <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--primary-light)"><circle cx="5" cy="5" r="5"/></svg>
    v1.3.0 &nbsp;&bull;&nbsp; MIT License
  </div>

  <h1>A Modern MUSH Server</h1>

  <p>
    High-performance, modular MU* engine built with <strong style="color:var(--text)">TypeScript</strong>
    and <strong style="color:var(--text)">Deno</strong>.<br>
    WebSocket-native &bull; Sandbox scripting &bull; Plugin architecture &bull; Discord bridge.
  </p>

  <div class="home-actions">
    <a href="/guides/installation/" class="btn-primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      Get Started
    </a>
    <a href="https://github.com/ursamu/ursamu" target="_blank" rel="noopener" class="btn-secondary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.834 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      View on GitHub
    </a>
    <a href="/guides/user-guide/" class="btn-secondary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Read the Docs
    </a>
  </div>
</div>

<!-- ── QUICK INSTALL ──────────────────────────────────────────────── -->
<div class="quickstart-block" style="animation-delay:0.1s">
  <div class="quickstart-inner">
    <div class="quickstart-bar">
      <span class="quickstart-dot" style="background:#ff5f57"></span>
      <span class="quickstart-dot" style="background:#febc2e"></span>
      <span class="quickstart-dot" style="background:#28c840"></span>
      <span style="margin-left:auto;font-size:0.7rem;color:var(--text-dim);font-family:'JetBrains Mono',monospace">terminal</span>
    </div>
    <pre class="quickstart-code"><span class="comment"># Install the UrsaMU DX bootstrapper</span>
<span class="cmd">deno install -A --global -n deno-x jsr:@dx/dx</span>
<span class="cmd">deno x --install-alias</span>
<span class="comment"># Initialize a new world</span>
<span class="cmd">dx jsr:@ursamu/ursamu init</span></pre>
  </div>
</div>

<!-- ── FEATURE CARDS ─────────────────────────────────────────────── -->
<div class="feature-grid" style="animation-delay:0.15s">

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    </div>
    <h3>WebSocket Native</h3>
    <p>First-class WebSocket interface with a 10 cmd/sec rate limiter. Connect from any browser or MU* client.</p>
  </div>

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <h3>Sandboxed Scripting</h3>
    <p>Scripts run in Web Workers with a rich SDK — database access, messaging, rooms, and channels — without touching the host.</p>
  </div>

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
    </div>
    <h3>Plugin Architecture</h3>
    <p>Extend the engine with typed plugins. Add commands, hooks, flags, routes, and custom database services.</p>
  </div>

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <h3>Discord Bridge</h3>
    <p>Built-in Discord integration with exponential-backoff reconnect — relay in-game chat to Discord channels and back.</p>
  </div>

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
    </div>
    <h3>Flexible Database</h3>
    <p>Pluggable database layer (dbojs) for game objects, channels, mail, and bulletin boards. Query by flags, owner, or custom data.</p>
  </div>

  <div class="feature-card">
    <div class="feature-card-icon">
      <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    </div>
    <h3>Scene Archive</h3>
    <p>Collaborative roleplay scene tracking with REST export endpoints — download logs as Markdown or JSON.</p>
  </div>

</div>

<!-- ── SECTION GRID ───────────────────────────────────────────────── -->
<div style="max-width:900px;margin:0 auto 1rem;padding:0 1rem">
  <p style="text-align:center;font-size:0.8rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:1.25rem">Jump to a section</p>
</div>

<div class="home-section-grid">
  <a href="/guides/installation/" class="home-section-card">
    <h4>Installation</h4>
    <p>Get UrsaMU running in minutes with the DX wizard, Docker, or from source.</p>
  </a>
  <a href="/guides/user-guide/" class="home-section-card">
    <h4>Player Guide</h4>
    <p>Commands, movement, communication, building, and object interaction.</p>
  </a>
  <a href="/guides/admin-guide/" class="home-section-card">
    <h4>Admin Guide</h4>
    <p>User management, channels, scene export, rate limiting, and security.</p>
  </a>
  <a href="/api/" class="home-section-card">
    <h4>API Reference</h4>
    <p>Core, database, command, flag, hook, and utility APIs documented in full.</p>
  </a>
  <a href="/plugins/" class="home-section-card">
    <h4>Plugin Dev</h4>
    <p>Build plugins that add commands, hooks, flags, and custom services.</p>
  </a>
  <a href="/development/contributing/" class="home-section-card">
    <h4>Contributing</h4>
    <p>Help shape UrsaMU — from bug reports to PRs and new features.</p>
  </a>
</div>

<!-- ── ARCHITECTURE OVERVIEW ─────────────────────────────────────── -->
<div style="max-width:900px;margin:0 auto 4rem;padding:0 1rem">
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:2rem;backdrop-filter:blur(8px)">
    <p style="font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--primary-light);margin-bottom:1rem">Architecture at a Glance</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;font-size:0.82rem;color:var(--text-muted)">
      <div>
        <div style="color:var(--text);font-weight:600;margin-bottom:0.35rem">Runtime</div>
        Deno (TypeScript) &bull; ESM modules &bull; Web Workers for sandboxing
      </div>
      <div>
        <div style="color:var(--text);font-weight:600;margin-bottom:0.35rem">Transport</div>
        WebSocket hub (4202) &bull; HTTP REST (4203) &bull; Telnet sidecar (4201)
      </div>
      <div>
        <div style="color:var(--text);font-weight:600;margin-bottom:0.35rem">Persistence</div>
        dbojs (game objects) &bull; chans &bull; mail &bull; bboard &bull; counters
      </div>
      <div>
        <div style="color:var(--text);font-weight:600;margin-bottom:0.35rem">Integrations</div>
        Discord gateway &bull; Scene REST API &bull; Plugin SDK
      </div>
    </div>
  </div>
</div>

<!-- ── COMMUNITY ─────────────────────────────────────────────────── -->
<div style="max-width:680px;margin:0 auto 5rem;text-align:center;padding:0 1rem">
  <p style="font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:1.5rem">Community & Links</p>
  <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
    <a href="https://github.com/ursamu/ursamu" target="_blank" rel="noopener" class="btn-secondary" style="font-size:0.8rem;padding:0.5rem 1rem">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      GitHub
    </a>
    <a href="https://discord.gg/ursamu" target="_blank" rel="noopener" class="btn-secondary" style="font-size:0.8rem;padding:0.5rem 1rem">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      Discord
    </a>
    <a href="/guides/installation/" class="btn-secondary" style="font-size:0.8rem;padding:0.5rem 1rem">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
      Quick Start
    </a>
  </div>
</div>
