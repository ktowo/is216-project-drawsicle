<script setup>
import { ref, computed } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  icon: { default: null },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: undefined },
  required: { type: Boolean, default: false },
  maxlength: { type: Number, default: undefined },
});
const emit = defineEmits(['update:modelValue']);

const id = `field-${Math.random().toString(36).slice(2, 9)}`;
const showPassword = ref(false);
const inputType = computed(() =>
  props.type === 'password' && showPassword.value ? 'text' : props.type
);
</script>

<template>
  <div class="field">
    <div class="field-head">
      <label :for="id" class="label">{{ label }}</label>
      <slot name="aside" />
    </div>
    <div class="input-wrap">
      <component :is="icon" v-if="icon" class="input-icon" :size="20" />
      <input
        :id="id"
        class="input"
        :type="inputType"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :required="required"
        :maxlength="maxlength"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="reveal"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
        @click="showPassword = !showPassword"
      >
        <component :is="showPassword ? EyeOff : Eye" :size="18" />
      </button>
    </div>
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
  background: #f5eee1;
}
</style>
