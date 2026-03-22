/**
 * Describes a UI component that a plugin contributes to the web client.
 *
 * Plugins register components via `registerUIComponent()` inside `init()`.
 * The engine aggregates all registered components and exposes them through
 * `GET /api/v1/ui-manifest`, filtered by the caller's privilege level.
 *
 * Slot names are free-form strings. The web client skin defines which slots
 * it renders; plugins choose which slot to target. Convention:
 *
 *   "client.sidebar"   — game client sidebar pane
 *   "client.status-bar"— game client status bar
 *   "client.output"    — game client main output area
 *   "nav"              — site-wide navigation
 *   "wiki.sidebar"     — wiki page sidebar
 *   "pages.index"      — home/index page section
 *   "admin.*"          — admin panel sections
 */
export interface IUIComponent {
  /** Custom element tag name, e.g. `"ursamu-scenes"`. Must be unique. */
  element: string;

  /**
   * Layout slot this component targets, e.g. `"client.sidebar"` or `"nav"`.
   * The skin/page template decides which slot names it renders.
   */
  slot: string;

  /**
   * URL of the script that calls `customElements.define()` for this element.
   * Serve it via `registerPluginRoute()` so it is same-origin.
   */
  script: string;

  /**
   * addCmd-style lock string controlling which callers see this component.
   * Defaults to `"connected"` when omitted.
   *
   * Examples: `""` | `"connected"` | `"connected builder+"` |
   *           `"connected admin+"` | `"connected wizard"`
   */
  lock?: string;

  /** Human-readable label, e.g. `"Scene Tracker"`. */
  label?: string;

  /** Sort order within the slot — lower numbers appear first. Defaults to 0. */
  order?: number;

  /** Name of the plugin that registered this component (for debugging). */
  plugin?: string;
}
