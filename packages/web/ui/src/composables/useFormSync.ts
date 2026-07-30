/**
 * Keep a local edit form in sync with a reactive source object.
 * While dirty, source changes never overwrite the form.
 * When clean, source updates (WS / poll / upsert) flow into the form.
 */
import { computed, ref, watch, type Ref, type WatchSource } from "vue";

export function useFormSync<TSource, TForm extends Record<string, unknown>>(
  source: WatchSource<TSource | null | undefined>,
  toForm: (src: TSource) => TForm,
) {
  const form = ref({} as TForm) as Ref<TForm>;
  const loadedSnap = ref("");
  const hasSource = ref(false);

  function snapOf(f: TForm): string {
    try {
      return JSON.stringify(f);
    } catch {
      return "";
    }
  }

  function apply(src: TSource): void {
    const next = toForm(src);
    form.value = next;
    loadedSnap.value = snapOf(next);
    hasSource.value = true;
  }

  const dirty = computed(() => {
    if (!hasSource.value || !loadedSnap.value) return false;
    return snapOf(form.value) !== loadedSnap.value;
  });

  watch(
    source,
    (src) => {
      if (!src) {
        hasSource.value = false;
        loadedSnap.value = "";
        return;
      }
      if (!dirty.value) apply(src);
    },
    { immediate: true, deep: true },
  );

  function markSaved(src?: TSource): void {
    if (src) apply(src);
    else loadedSnap.value = snapOf(form.value);
  }

  function resetFrom(src: TSource): void {
    apply(src);
  }

  function confirmLeave(msg = "Discard unsaved changes?"): boolean {
    if (!dirty.value) return true;
    return globalThis.confirm(msg);
  }

  return {
    form,
    dirty,
    hasSource,
    markSaved,
    resetFrom,
    confirmLeave,
  };
}
