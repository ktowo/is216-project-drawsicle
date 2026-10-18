<script setup>
import { computed } from 'vue';
import { ExternalLink } from 'lucide-vue-next';
import { splitLinks, linkHref, linkText } from '@/utils/links';

// Free text (a wishlist, notes) with any links in it shown as links that open in a new tab.
// Line breaks are kept. Never uses v-html.
const props = defineProps({
  text: { type: String, default: '' },
  tag: { type: String, default: 'p' },
});
const parts = computed(() => splitLinks(props.text));
</script>

<template>
  <component :is="tag" class="linkified">
    <template v-for="(part, i) in parts" :key="i">
      <a v-if="part.url" :href="linkHref(part.url)" target="_blank" rel="noopener noreferrer" class="inline-link">
        {{ linkText({ url: part.url }) }}<ExternalLink :size="12" aria-hidden="true" /><span class="sr-only"> (opens in a new tab)</span>
      </a>
      <template v-else>{{ part.text }}</template>
    </template>
  </component>
</template>

<style scoped>
.linkified {
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.inline-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-weight: 600;
  white-space: nowrap;
}
.inline-link:hover {
  background: var(--pink-line);
}
</style>
