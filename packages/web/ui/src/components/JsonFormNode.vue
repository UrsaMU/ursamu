<script lang="ts">
/**
 * Recursive labeled fields for one JSON value.
 * Used by JsonFormEditor in Form mode.
 */
import {
  defineComponent,
  h,
  type PropType,
  type VNode,
} from "vue";
import {
  humanizeKey,
  isPlainObject,
  isScalarArray,
  scalarArrayToText,
  textToScalarArray,
  type JsonPath,
} from "@/utils/jsonForm";

type Handlers = {
  set: (path: JsonPath, value: unknown) => void;
  remove: (path: JsonPath) => void;
  addItem: (path: JsonPath, sample: unknown) => void;
};

const JsonFormNode = defineComponent({
  name: "JsonFormNode",
  props: {
    value: {
      type: null as unknown as PropType<unknown>,
      required: true,
    },
    path: {
      type: Array as PropType<JsonPath>,
      required: true,
    },
    depth: { type: Number, default: 0 },
    label: { type: String, default: "" },
  },
  emits: ["set", "remove", "add-item"],
  setup(props, { emit }) {
    const handlers: Handlers = {
      set: (path, value) => emit("set", path, value),
      remove: (path) => emit("remove", path),
      addItem: (path, sample) =>
        emit("add-item", path, sample),
    };

    return () =>
      renderNode(
        props.value,
        props.path,
        props.depth,
        props.label,
        handlers,
      );
  },
});

export default JsonFormNode;

function renderNode(
  value: unknown,
  path: JsonPath,
  depth: number,
  label: string,
  handlers: Handlers,
): VNode {
  if (typeof value === "boolean") {
    return h("label", { class: "jfe-field jfe-check" }, [
      h("input", {
        type: "checkbox",
        checked: value,
        onChange: (e: Event) => {
          handlers.set(
            path,
            (e.target as HTMLInputElement).checked,
          );
        },
      }),
      h("span", label || "Enabled"),
    ]);
  }

  if (typeof value === "number") {
    return h("div", { class: "jfe-field" }, [
      label
        ? h("span", { class: "jfe-label" }, label)
        : null,
      h("input", {
        type: "number",
        value,
        onInput: (e: Event) => {
          const n = (e.target as HTMLInputElement)
            .valueAsNumber;
          handlers.set(
            path,
            Number.isNaN(n) ? 0 : n,
          );
        },
      }),
    ]);
  }

  if (typeof value === "string") {
    const multiline = value.length > 80 ||
      value.includes("\n");
    return h("div", { class: "jfe-field" }, [
      label
        ? h("span", { class: "jfe-label" }, label)
        : null,
      multiline
        ? h("textarea", {
          rows: Math.min(
            10,
            Math.max(3, value.split("\n").length + 1),
          ),
          value,
          onInput: (e: Event) => {
            handlers.set(
              path,
              (e.target as HTMLTextAreaElement).value,
            );
          },
        })
        : h("input", {
          type: "text",
          value,
          onInput: (e: Event) => {
            handlers.set(
              path,
              (e.target as HTMLInputElement).value,
            );
          },
        }),
    ]);
  }

  if (value === null || value === undefined) {
    return h("div", { class: "jfe-field" }, [
      label
        ? h("span", { class: "jfe-label" }, label)
        : null,
      h("input", {
        type: "text",
        value: "",
        placeholder: "null",
        onInput: (e: Event) => {
          handlers.set(
            path,
            (e.target as HTMLInputElement).value,
          );
        },
      }),
    ]);
  }

  if (isScalarArray(value)) {
    return h("div", { class: "jfe-field" }, [
      label
        ? h("span", { class: "jfe-label" }, [
          label,
          h(
            "span",
            { class: "jfe-hint" },
            " — one per line",
          ),
        ])
        : null,
      h("textarea", {
        class: "mono",
        rows: Math.min(
          12,
          Math.max(3, value.length + 1),
        ),
        value: scalarArrayToText(value),
        onInput: (e: Event) => {
          handlers.set(
            path,
            textToScalarArray(
              (e.target as HTMLTextAreaElement).value,
              value,
            ),
          );
        },
      }),
    ]);
  }

  if (Array.isArray(value)) {
    const children: VNode[] = [
      h("div", { class: "jfe-array-head" }, [
        h(
          "span",
          { class: "jfe-label" },
          `${label || "Items"} (${value.length})`,
        ),
        h(
          "button",
          {
            type: "button",
            class: "secondary outline jfe-mini",
            onClick: () =>
              handlers.addItem(path, value[0] ?? {}),
          },
          "+ Add",
        ),
      ]),
    ];
    const limit = Math.min(value.length, 40);
    for (let i = 0; i < limit; i++) {
      children.push(
        h("div", { class: "jfe-card", key: i }, [
          h("div", { class: "jfe-card-leg" }, [
            h("span", `#${i + 1}`),
            h(
              "button",
              {
                type: "button",
                class: "secondary outline jfe-mini",
                onClick: () =>
                  handlers.remove([...path, i]),
              },
              "Remove",
            ),
          ]),
          h(JsonFormNode, {
            value: value[i],
            path: [...path, i],
            depth: depth + 1,
            onSet: (
              p: JsonPath,
              v: unknown,
            ) => handlers.set(p, v),
            onRemove: (p: JsonPath) =>
              handlers.remove(p),
            onAddItem: (
              p: JsonPath,
              s: unknown,
            ) => handlers.addItem(p, s),
          }),
        ]),
      );
    }
    return h("div", { class: "jfe-list-block" }, children);
  }

  if (isPlainObject(value)) {
    const children: VNode[] = [];
    if (label) {
      children.push(
        h(
          "div",
          {
            class: depth === 0
              ? "jfe-section-title"
              : "jfe-nested-title",
          },
          label,
        ),
      );
    }
    for (const k of Object.keys(value)) {
      children.push(
        h(JsonFormNode, {
          key: k,
          value: value[k],
          path: [...path, k],
          depth: depth + 1,
          label: humanizeKey(k),
          onSet: (
            p: JsonPath,
            v: unknown,
          ) => handlers.set(p, v),
          onRemove: (p: JsonPath) =>
            handlers.remove(p),
          onAddItem: (
            p: JsonPath,
            s: unknown,
          ) => handlers.addItem(p, s),
        }),
      );
    }
    return h(
      "div",
      { class: depth > 0 ? "jfe-nest" : "jfe-object" },
      children,
    );
  }

  return h("p", { class: "muted" }, "—");
}
</script>
