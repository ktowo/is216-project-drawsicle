<script setup>
import { ref, computed, useId } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  icon: { type: [Object, Function], default: null },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: undefined },
  required: { type: Boolean, default: false },
  maxlength: { type: Number, default: undefined },
  id: { type: String, default: '' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const id = props.id || `field-${useId()}`;
const showPassword = ref(false);
const inputType = computed(() => (props.type === 'password' && showPassword.value ? 'text' : props.type));
const describedby = computed(
  () => [props.error && `${id}-error`, props.hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
);
</script>

<template>
  <div class="field">
    <div class="field-head">
      <label :for="id" class="label">{{ label }}</label>
      <slot name="aside" />
    </div>
    <div class="input-wrap" :class="{ 'is-invalid': error, 'is-disabled': disabled || readonly }">
      <component :is="icon" v-if="icon" class="input-icon" :size="20" aria-hidden="true" />
      <input
        :id="id"
        class="input"
        :type="inputType"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :required="required"
        :maxlength="maxlength"
        :disabled="disabled"
        :readonly="readonly"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedby"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="reveal"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
        :aria-pressed="showPassword ? 'true' : 'false'"
        @click="showPassword = !showPassword"
      >
        <component :is="showPassword ? EyeOff : Eye" :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="field-error">{{ error }}</p>
    <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.reveal {
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  padding: 6px;
  display: grid;
  place-items: center;
  border-radius: 8px;
}
.reveal:hover {
  background: var(--hover);
}
.field-error,
.hint {
  margin: 0;
}
</style>
