<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ListTree } from 'lucide-vue-next';

// Shared frame for the info pages (About, Help, Guidelines, Privacy, Terms).
// Title, intro and a "Last updated" line on top, the page content in the default slot, and a
// sticky "On this page" list on wide screens. Put each part of the page in a <section id="..."> with
// an <h2>: the list is built from those unless `sections` is passed in.
const props = defineProps({
  title: { type: String, required: true },
  intro: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  // 'Last updated' text, e.g. '12 October 2026'
  updated: { type: String, default: '' },
  // Optional list of { id, title }; otherwise read from the page's own sections
  sections: { type: Array, default: null },
  // Turn the side list off for short pages
  toc: { type: Boolean, default: true },
  // Page the reader is on, hidden from the "More" links at the bottom
  current: { type: String, default: '' },
});

const route = useRoute();
const body = ref(null);
const jump = ref(null);
const found = ref([]);
const activeId = ref('');

const items = computed(() => (props.sections && props.sections.length ? props.sections : found.value));
const showToc = computed(() => props.toc && items.value.length > 2);

const MORE_PAGES = [
  { key: 'help', to: '/help', label: 'Help & FAQ' },
  { key: 'guidelines', to: '/guidelines', label: 'Community guidelines' },
  { key: 'about', to: '/about', label: 'About' },
  { key: 'privacy', to: '/privacy', label: 'Privacy' },
  { key: 'terms', to: '/terms', label: 'Terms' },
];
const morePages = computed(() => MORE_PAGES.filter((p) => p.key !== props.current));

function readSections() {
  if (props.sections && props.sections.length) return;
  const list = body.value ? [...body.value.querySelectorAll('section[id]')] : [];
  found.value = list
    .map((el) => ({ id: el.id, title: el.querySelector('h2')?.textContent?.trim() || '' }))
    .filter((s) => s.title);
}

// Highlight the section being read. Skipped quietly where IntersectionObserver is missing.
let observer = null;
function watchSections() {
  observer?.disconnect();
  observer = null;
  if (typeof IntersectionObserver === 'undefined' || !body.value) return;
  const visible = new Set();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const first = items.value.find((s) => visible.has(s.id));
      if (first) activeId.value = first.id;
    },
    { rootMargin: '-90px 0px -55% 0px' }
  );
  for (const s of items.value) {
    const el = document.getElementById(s.id);
    if (el) observer.observe(el);
  }
}

onMounted(async () => {
  await nextTick();
  readSections();
  await nextTick();
  watchSections();
});
onBeforeUnmount(() => observer?.disconnect());

function closeJump() {
  if (jump.value) jump.value.open = false;
}

const tocLabel = computed(() => `On this page: ${props.title}`);
</script>

<template>
  <main id="main" class="page info-page">
    <header class="info-head">
      <span v-if="icon" class="info-icon" aria-hidden="true"><component :is="icon" :size="26" /></span>
      <h1 class="info-title">{{ title }}</h1>
      <p v-if="intro" class="info-intro">{{ intro }}</p>
      <p v-if="updated" class="info-updated">Last updated {{ updated }}</p>
    </header>

    <div class="info-grid" :class="{ 'has-toc': showToc }">
      <aside v-if="showToc" class="info-toc">
        <nav :aria-label="tocLabel">
          <p class="toc-title"><ListTree :size="15" aria-hidden="true" /> On this page</p>
          <ul>
            <li v-for="s in items" :key="s.id">
              <RouterLink
                :to="{ path: route.path, hash: `#${s.id}` }"
                class="toc-link"
                :class="{ active: activeId === s.id }"
                :aria-current="activeId === s.id ? 'location' : undefined"
                @click="activeId = s.id"
              >
                {{ s.title }}
              </RouterLink>
            </li>
          </ul>
        </nav>
      </aside>

      <div class="info-main">
        <!-- Small screens get the same list as a collapsible "Jump to" box -->
        <details v-if="showToc" ref="jump" class="card toc-mobile">
          <summary class="toc-summary"><ListTree :size="16" aria-hidden="true" /> Jump to a section</summary>
          <ul>
            <li v-for="s in items" :key="`m-${s.id}`">
              <RouterLink :to="{ path: route.path, hash: `#${s.id}` }" class="toc-link" @click="closeJump">
                {{ s.title }}
              </RouterLink>
            </li>
          </ul>
        </details>

        <slot name="before" />

        <div ref="body" class="card info-body">
          <slot />
        </div>

        <slot name="after" />

        <nav class="info-more" aria-label="More about Drawisicle">
          <p class="more-title">More about Drawisicle</p>
          <ul>
            <li v-for="p in morePages" :key="p.key">
              <RouterLink :to="p.to" class="more-link">{{ p.label }}</RouterLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </main>
</template>

<style scoped>
.info-page {
  max-width: 1080px;
}
.info-head {
  max-width: 720px;
  margin-bottom: 32px;
}
.info-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: var(--pink);
  color: #fff;
  box-shadow: 0 6px 16px rgba(236, 106, 147, 0.28);
  margin-bottom: 16px;
}
.info-title {
  font-size: clamp(2rem, 5vw, 2.7rem);
  font-weight: 800;
}
.info-intro {
  margin: 12px 0 0;
  font-size: 1.12rem;
  line-height: 1.65;
  color: var(--muted);
}
.info-updated {
  margin: 14px 0 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
}

.info-grid {
  display: block;
}
.info-grid.has-toc {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 36px;
  align-items: start;
}
.info-toc {
  position: sticky;
  top: 92px;
  align-self: start;
  max-height: calc(100vh - 110px);
  overflow-y: auto;
}
.toc-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.info-toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border-left: 2px solid var(--border);
}
.toc-link {
  display: block;
  padding: 6px 12px;
  margin-left: -2px;
  border-left: 2px solid transparent;
  color: var(--text);
  font-weight: 600;
  font-size: 0.93rem;
  line-height: 1.35;
}
.toc-link:hover {
  color: var(--pink-dark);
}
.toc-link.active {
  border-left-color: var(--pink);
  color: var(--pink-dark);
}

.toc-mobile {
  display: none;
  margin-bottom: 16px;
  padding: 0 16px;
}
.toc-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  font-weight: 700;
  cursor: pointer;
}
.toc-mobile ul {
  list-style: none;
  margin: 0;
  padding: 0 0 10px;
}
.toc-mobile .toc-link {
  padding: 9px 0;
  margin-left: 0;
  border-left: 0;
}

.info-body {
  padding: 8px 36px;
}
/* Shared typography for the page content (it comes in through the slot) */
.info-body :deep(section) {
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
}
.info-body :deep(section:last-child) {
  border-bottom: 0;
}
.info-body :deep(h2) {
  font-size: 1.55rem;
  font-weight: 800;
  margin-bottom: 12px;
}
.info-body :deep(h3) {
  font-family: var(--font-body);
  font-size: 1.08rem;
  font-weight: 700;
  margin: 20px 0 6px;
}
.info-body :deep(p) {
  margin: 0 0 12px;
  line-height: 1.7;
}
.info-body :deep(p:last-child) {
  margin-bottom: 0;
}
.info-body :deep(ul),
.info-body :deep(ol) {
  margin: 0 0 12px;
  padding-left: 1.3em;
  line-height: 1.7;
}
.info-body :deep(li) {
  margin-bottom: 6px;
}
.info-body :deep(li::marker) {
  color: var(--pink);
}
.info-body :deep(a) {
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1.5px;
}
.info-body :deep(strong) {
  font-weight: 700;
}
.info-body :deep(.callout) {
  margin: 14px 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--pink-soft);
  color: var(--text);
  line-height: 1.6;
}

.info-more {
  margin-top: 28px;
}
.more-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.info-more ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.more-link {
  display: inline-block;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: 0.92rem;
}
.more-link:hover {
  border-color: var(--pink);
  color: var(--pink-dark);
}

@media (max-width: 900px) {
  .info-grid.has-toc {
    display: block;
  }
  .info-toc {
    display: none;
  }
  .toc-mobile {
    display: block;
  }
}
@media (max-width: 640px) {
  .info-head {
    margin-bottom: 22px;
  }
  .info-body {
    padding: 4px 18px;
  }
  .info-body :deep(section) {
    padding: 22px 0;
  }
  .info-body :deep(h2) {
    font-size: 1.35rem;
  }
}
</style>
