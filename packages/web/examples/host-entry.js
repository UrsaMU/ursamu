/**
 * Example same-origin ESM host module for registerStaffPage({ module }).
 *
 * Serve this (or a Vite-built bundle) at e.g. /admin/mytool/host-entry.js
 * and register:
 *
 *   registerStaffPage({
 *     id: "mytool",
 *     label: "My Tool",
 *     module: "/admin/mytool/host-entry.js",
 *     embed: "/admin/mytool/", // fallback if import fails
 *   });
 *
 * Must export default a Vue component. This sample uses the Vue global
 * from the host page (import map / window) when available; prefer a
 * real build that imports vue as a peer.
 *
 * Peer: vue@^3.5 (same major as packages/web/ui).
 */

/** @type {import('vue').DefineComponent} */
const HostEntrySample = {
  name: "HostEntrySample",
  template: `
    <article class="dash-browser" id="main-plugin-module">
      <header class="dash-header">
        <div>
          <p class="muted dash-kicker">Plugin module</p>
          <h1 class="page-title">Host ESM sample</h1>
          <p class="muted">
            Loaded via <code>registerStaffPage({ module })</code>.
            Replace this file with your real view bundle.
          </p>
        </div>
      </header>
      <p class="muted">
        Vue peer: ^3.5 · same-origin only · fallback to
        <code>embed</code> if import fails.
      </p>
    </article>
  `,
};

export default HostEntrySample;
