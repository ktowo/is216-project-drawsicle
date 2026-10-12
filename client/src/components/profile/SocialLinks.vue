<script setup>
import { computed } from 'vue';
import { AtSign, Camera, Cloud, Brush, House, NotebookPen, MessageCircle, ExternalLink, Copy } from 'lucide-vue-next';
import { socialEntries } from '@/utils/social';
import { toast } from '@/stores/toast';

// Someone's social handles as links (Discord as a handle with a copy button).
// Renders nothing when they haven't added any.
const props = defineProps({
  socials: { type: Object, default: null },
  // Name used in screen reader labels, e.g. "Mika on Instagram"
  ownerName: { type: String, default: '' },
});

// Plain icons rather than brand logos
const ICONS = {
  twitter: AtSign,
  instagram: Camera,
  bluesky: Cloud,
  deviantart: Brush,
  toyhouse: House,
  tumblr: NotebookPen,
  discord: MessageCircle,
};

const entries = computed(() => socialEntries(props.socials));

function linkLabel(entry) {
  const who = props.ownerName ? `${props.ownerName} on ` : '';
  return `${who}${entry.label}: @${entry.handle} (opens in a new tab)`;
}

async function copyHandle(entry) {
  try {
    await navigator.clipboard.writeText(entry.handle);
    toast.success(`${entry.label} username copied: ${entry.handle}`);
  } catch {
    // Clipboard blocked (older browser or no permission): show it so it can be copied by hand
    toast.info(`Couldn't copy automatically. The ${entry.label} username is ${entry.handle}`, { duration: 8000 });
  }
}
</script>

<template>
  <ul v-if="entries.length" class="social-links" aria-label="Social links">
    <li v-for="entry in entries" :key="entry.key">
      <a
        v-if="entry.url"
        :href="entry.url"
        target="_blank"
        rel="noopener noreferrer"
        class="social"
        :aria-label="linkLabel(entry)"
      >
        <component :is="ICONS[entry.key]" :size="16" class="social-icon" aria-hidden="true" />
        <span class="social-text">
          <span class="social-platform">{{ entry.label }}</span>
          <span class="social-handle">@{{ entry.handle }}</span>
        </span>
        <ExternalLink :size="14" class="social-out" aria-hidden="true" />
      </a>

      <span v-else class="social is-static">
        <component :is="ICONS[entry.key]" :size="16" class="social-icon" aria-hidden="true" />
        <span class="social-text">
          <span class="social-platform">{{ entry.label }}</span>
          <span class="social-handle">{{ entry.handle }}</span>
        </span>
        <button
          type="button"
          class="copy-btn"
          :aria-label="`Copy ${entry.label} username ${entry.handle}`"
          title="Copy username"
          @click="copyHandle(entry)"
        >
          <Copy :size="14" aria-hidden="true" />
        </button>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.social-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.social {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 7px 12px 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.25;
}
a.social:hover {
  border-color: var(--pink);
  color: var(--text);
  background: #fff7fa;
}
a.social:focus-visible {
  border-radius: 999px;
}
.social.is-static {
  padding-right: 5px;
}
.social-icon {
  flex-shrink: 0;
  color: var(--pink-dark);
}
.social-text {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.social-platform {
  font-weight: 700;
  white-space: nowrap;
}
.social-handle {
  color: var(--muted);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.social-out {
  flex-shrink: 0;
  color: var(--muted);
}
.copy-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  background: #f5eee1;
  color: var(--muted);
  border-radius: 999px;
  padding: 5px;
  cursor: pointer;
}
.copy-btn:hover {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.copy-btn:focus-visible {
  border-radius: 999px;
}
</style>
