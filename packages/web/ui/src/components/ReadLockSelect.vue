<script setup lang="ts">
import { READ_LOCKS } from "@/utils/wiki";

const model = defineModel<string>({ required: true });

defineProps<{
  id?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ change: [] }>();
</script>

<template>
  <select
    :id="id"
    v-model="model"
    :disabled="disabled"
    @change="emit('change')"
  >
    <option
      v-for="opt in READ_LOCKS"
      :key="opt.value"
      :value="opt.value"
    >
      {{ opt.label }}
    </option>
    <!-- Preserve custom locks from the API -->
    <option
      v-if="model && !READ_LOCKS.some((o) => o.value === model)"
      :value="model"
    >
      {{ model }}
    </option>
  </select>
</template>
