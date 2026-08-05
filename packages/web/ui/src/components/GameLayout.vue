<script setup lang="ts">
/**
 * Declarative renderer for u.ui.layout payloads.
 * Host classes only — design.md §0.2.
 */
import MushText from "@/components/MushText.vue";

defineProps<{
  components?: unknown[];
  meta?: Record<string, unknown>;
}>();

function asRec(c: unknown): Record<string, unknown> {
  return c && typeof c === "object"
    ? (c as Record<string, unknown>)
    : {};
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") {
    return String(v);
  }
  return String(v);
}
</script>

<template>
  <div
    class="game-layout"
    :data-meta-type="meta?.type ? String(meta.type) : undefined"
  >
    <template
      v-for="(raw, i) in (components ?? [])"
      :key="i"
    >
      <template v-if="asRec(raw).type === 'header'">
        <header class="game-layout__header">
          <h2 class="game-layout__title">
            <MushText
              :text="String(
                asRec(raw).title ??
                  asRec(raw).content ??
                  '',
              )"
            />
          </h2>
        </header>
      </template>

      <template v-else-if="asRec(raw).type === 'table'">
        <div class="table-wrap game-layout__table-wrap">
          <table class="dash-table game-layout__table">
            <tbody>
              <tr
                v-for="(row, ri) in (
                  Array.isArray(asRec(raw).content)
                    ? asRec(raw).content as unknown[]
                    : []
                )"
                :key="ri"
              >
                <td
                  v-for="(cell, ci) in (
                    Array.isArray(row) ? row : [row]
                  )"
                  :key="ci"
                >
                  <MushText :text="cellText(cell)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else-if="asRec(raw).type === 'list'">
        <ul class="game-layout__list">
          <li
            v-for="(item, li) in (
              Array.isArray(asRec(raw).content)
                ? asRec(raw).content as unknown[]
                : [asRec(raw).content]
            )"
            :key="li"
          >
            <MushText :text="cellText(item)" />
          </li>
        </ul>
      </template>

      <template v-else-if="asRec(raw).type === 'panel'">
        <section class="game-layout__panel">
          <h3
            v-if="asRec(raw).title"
            class="game-layout__panel-title muted"
          >
            {{ String(asRec(raw).title) }}
          </h3>
          <div class="game-layout__panel-body">
            <MushText
              v-if="typeof asRec(raw).content === 'string'"
              :text="String(asRec(raw).content)"
            />
            <pre
              v-else
              class="game-pre game-pre--nested"
            >{{
              JSON.stringify(asRec(raw).content, null, 2)
            }}</pre>
          </div>
        </section>
      </template>

      <template v-else>
        <div class="game-layout__fallback">
          <MushText
            v-if="typeof asRec(raw).content === 'string'"
            :text="String(asRec(raw).content)"
          />
          <MushText
            v-else-if="typeof raw === 'string'"
            :text="raw"
          />
        </div>
      </template>
    </template>
  </div>
</template>
