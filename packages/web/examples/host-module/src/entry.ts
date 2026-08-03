/**
 * Demo host ESM module for registerStaffPage({ module }).
 * Built with vite (vue bundled in) → examples/dist/host-entry.js
 */
import { defineComponent, h } from "vue";

export default defineComponent({
  name: "HostEntryDemo",
  setup() {
    return () =>
      h(
        "article",
        { class: "dash-browser", id: "main-plugin-module" },
        [
          h("header", { class: "dash-header" }, [
            h("div", [
              h("p", { class: "muted dash-kicker" }, "Plugin module"),
              h("h1", { class: "page-title" }, "Host ESM demo"),
              h(
                "p",
                { class: "muted" },
                "Loaded via registerStaffPage({ module }). Vue is bundled in this file.",
              ),
            ]),
          ]),
          h(
            "p",
            { class: "muted" },
            [
              "Peer major: vue@3 · same-origin only · ",
              "fallback to embed if import fails.",
            ],
          ),
        ],
      );
  },
});
