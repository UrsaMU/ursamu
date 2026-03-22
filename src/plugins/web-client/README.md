# web-client

> Default web client for UrsaMU — slot-based layout, CSS custom property theming, no build step required.

## What it does

Serves an HTML/CSS/JS game client at `/client`. The client:

- Handles login / token validation against the UrsaMU REST API
- Fetches `GET /api/v1/ui-manifest` to discover which UI components are registered
- Dynamically imports and mounts each component into its named layout slot
- Connects to the UrsaMU WebSocket (`?client=web`) for real-time game output
- Applies theme colours from `GET /api/v1/config` as CSS custom properties

The plugin also registers three built-in components via `registerUIComponent`:

| Element | Slot | Lock | Description |
|---------|------|------|-------------|
| `ursamu-output` | `client.output` | connected | Scrolling game output pane |
| `ursamu-input` | `client.input` | connected | Command input bar with history |
| `ursamu-who` | `client.sidebar` | connected | Online players list (polls every 30s) |

## Slot naming convention

The HTML shell declares these slots. Other plugins target them with `registerUIComponent`:

| Slot | Location |
|------|----------|
| `nav` | Top navigation bar |
| `client.output` | Main output area |
| `client.sidebar` | Right sidebar |
| `client.input` | Bottom input bar |
| `client.status-bar` | Footer status row |

Any plugin can add components to these slots — or introduce new slot names that another skin knows about.

## How to customize

### Option 1 — CSS custom properties (easiest)

Edit `static/style.css` and change the `:root` variables:

```css
:root {
  --bg:     #1a0e00;   /* page background */
  --accent: #ff6600;   /* highlight colour */
  --font:   "VT323", monospace;
}
```

No HTML or JS knowledge needed.

### Option 2 — config.json theme block (zero file editing)

Add a `theme` block to your `config.json`. `client.js` applies these values
as CSS custom properties automatically on every page load:

```json
{
  "game": { "name": "Shadow City" },
  "theme": {
    "background": "#0d0d0d",
    "surface":    "#141414",
    "text":       "#c8c8c8",
    "primary":    "#b45309",
    "muted":      "#555"
  }
}
```

### Option 3 — full layout change

Edit `static/index.html` to add, remove, or re-arrange `[data-slot]` containers.
Edit `static/client.js` for auth or WebSocket behaviour changes.

### Option 4 — add a component from another plugin

Any plugin that calls `registerUIComponent` contributes to the manifest. No
changes to the web-client plugin are required:

```typescript
// In your plugin's init():
registerPluginRoute("/api/v1/myplugin/client.js", serveScript);
registerUIComponent({
  element: "my-dice-roller",
  slot:    "client.sidebar",
  script:  "/api/v1/myplugin/client.js",
  lock:    "connected",
  order:   20,
});
```

## Storage

None — this plugin stores nothing in the database.

## REST Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/client` | No | Serve `index.html` |
| `GET` | `/client/*` | No | Serve static assets (CSS, JS, components) |

## Install

This plugin lives in `src/plugins/web-client/` and is loaded automatically
on server start alongside other built-in plugins.

**Future:** Will be extracted to `@ursamu/web-client-plugin` (separate repo,
installable via `plugins.manifest.json`). When extracted, internal imports
(`../../app.ts`) become `jsr:@ursamu/ursamu`.

## Theming cheat-sheet

| CSS variable | Config key | Default | Purpose |
|---|---|---|---|
| `--bg` | `theme.background` | `#0d0d0d` | Page background |
| `--bg-secondary` | `theme.surface` | `#141414` | Input / panel background |
| `--fg` | `theme.text` | `#c8c8c8` | Primary text |
| `--fg-muted` | `theme.muted` | `#666` | Labels, timestamps |
| `--accent` | `theme.primary` | `#f97316` | Buttons, focus, headers |
| `--border` | `theme.glassBorder` | `#2a2a2a` | Dividers |
| `--font` | — | `"Courier New"` | Font stack |
| `--sidebar-width` | — | `200px` | Right sidebar width |
