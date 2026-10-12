<script setup>
import { RouterLink } from 'vue-router';
import { ChevronDown } from 'lucide-vue-next';

// One question in the Help accordion. The parent owns which items are open.
// `blocks` is a list of paragraphs (strings), { list: [] } and { links: [{ to, label }] }.
defineProps({
  id: { type: String, required: true },
  question: { type: String, required: true },
  blocks: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle']);
</script>

<template>
  <div :id="id" class="faq" :class="{ open }">
    <h3 class="faq-q">
      <button
        :id="`${id}-button`"
        type="button"
        class="faq-button"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="`${id}-panel`"
        @click="emit('toggle')"
      >
        <span class="faq-text">{{ question }}</span>
        <ChevronDown :size="20" class="faq-chev" aria-hidden="true" />
      </button>
    </h3>
    <div
      v-show="open"
      :id="`${id}-panel`"
      class="faq-a"
      role="region"
      :aria-labelledby="`${id}-button`"
    >
      <template v-for="(block, i) in blocks" :key="i">
        <p v-if="typeof block === 'string'">{{ block }}</p>
        <ul v-else-if="block.list">
          <li v-for="line in block.list" :key="line">{{ line }}</li>
        </ul>
        <p v-else-if="block.links" class="faq-related">
          <span class="related-label">Related:</span>
          <RouterLink v-for="link in block.links" :key="link.to" :to="link.to" class="related-link">
            {{ link.label }}
          </RouterLink>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.faq {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  scroll-margin-top: 92px;
  transition: border-color 0.15s, background 0.15s;
}
.faq + .faq {
  margin-top: 10px;
}
.faq.open {
  border-color: var(--pink-line);
  background: var(--pink-tint);
}
/* Headings inside the info page get their own big margins; reset them for the question row */
.faq-q {
  margin: 0 !important;
  font-family: var(--font-body);
  font-size: 1rem !important;
}
.faq-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  background: none;
  color: var(--text);
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius);
}
.faq-button:hover .faq-text {
  color: var(--pink-dark);
}
.faq-button:focus-visible {
  border-radius: var(--radius);
}
.faq-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.faq-chev {
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.15s;
}
.faq.open .faq-chev {
  transform: rotate(180deg);
  color: var(--pink-dark);
}
.faq-a {
  padding: 0 16px 16px;
}
.faq-related {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.related-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--muted);
}
.related-link {
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.88rem;
  text-decoration: none !important;
}
.related-link:hover {
  background: var(--pink-soft);
}
@media (prefers-reduced-motion: reduce) {
  .faq,
  .faq-chev {
    transition: none;
  }
}
</style>
