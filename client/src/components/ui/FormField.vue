<script setup>
import { computed } from 'vue';

// Label + control + hint/error, using the .field styles.
//   <FormField label="Name" for-id="name" :error="errors.name" required>
//     <div class="input-wrap"><input id="name" class="input" ... /></div>
//   </FormField>
// The label gets id "<forId>-label" (for groups that need aria-labelledby) and the hint/error
// get "<forId>-hint" / "<forId>-error"; the slot receives `describedby` and `invalid` to wire them up.
const props = defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  forId: { type: String, default: '' },
  // The control is a group of buttons (ChoiceChips), not one input: the label becomes plain text
  // and the group points at it with aria-labelledby="<forId>-label"
  group: { type: Boolean, default: false },
});

const labelId = computed(() => (props.forId ? `${props.forId}-label` : undefined));
const hintId = computed(() => (props.forId && props.hint ? `${props.forId}-hint` : undefined));
const errorId = computed(() => (props.forId && props.error ? `${props.forId}-error` : undefined));
const describedby = computed(() => [errorId.value, hintId.value].filter(Boolean).join(' ') || undefined);
</script>

<template>
  <div class="field" :class="{ 'has-error': error }">
    <div v-if="label || $slots.aside" class="field-head">
      <component
        :is="group ? 'span' : 'label'"
        v-if="label"
        :id="labelId"
        :for="group ? undefined : forId || undefined"
        class="label"
      >
        {{ label }}
        <span v-if="required" class="required" aria-hidden="true">*</span>
        <span v-if="required" class="sr-only">(required)</span>
      </component>
      <slot name="aside" />
    </div>

    <slot :describedby="describedby" :invalid="Boolean(error)" />

    <p v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</p>
    <p v-if="hint" :id="hintId" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.required {
  color: var(--pink-dark);
  margin-left: 2px;
}
.field-error,
.hint {
  margin: 0;
}
.has-error :deep(.input-wrap) {
  border-color: var(--danger);
}
.has-error :deep(.input-wrap:focus-within) {
  box-shadow: 0 0 0 3px var(--danger-soft);
}
</style>
