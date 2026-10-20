<script setup>
import { computed } from 'vue';
import { ExternalLink } from 'lucide-vue-next';
import { ON_THE_RECORD, splitHighlights } from './onTheRecord';
import { formatDate } from '@/utils/format';

// A real public post about how hard exchanges are to run by hand, quoted word for word, dated,
// credited and linked. Nothing renders in production until the author has agreed.
const quote = ON_THE_RECORD;
const visible = computed(() => quote.permission || import.meta.env.DEV);
const paragraphs = computed(() => quote.paragraphs.map(splitHighlights));
const initial = computed(() => quote.author.replace(/^u\//, '').charAt(0).toUpperCase());
</script>

<template>
  <section v-if="visible" class="record" aria-labelledby="record-heading">
    <div class="left">
      <p class="eyebrow">On the record · {{ formatDate(quote.date) }}</p>
      <h2 id="record-heading" class="title">{{ quote.headline }}</h2>
      <p class="by">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <span><b>{{ quote.author }}</b><small>{{ quote.platform }} · {{ quote.community }}</small></span>
      </p>
    </div>
    <figure class="card">
      <figcaption class="card-head">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <span><b>{{ quote.author }}</b><small>{{ quote.community }} · {{ formatDate(quote.date) }}</small></span>
        <a class="original" :href="quote.url" target="_blank" rel="noopener noreferrer">
          View original <ExternalLink :size="13" aria-hidden="true" /><span class="sr-only">(opens in a new tab)</span>
        </a>
      </figcaption>
      <blockquote>
        <p v-for="(parts, i) in paragraphs" :key="i">
          “<template v-for="(part, j) in parts" :key="j"><mark v-if="part.mark">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>”
        </p>
      </blockquote>
      <p class="foot">
        {{ quote.title }}
        <span v-if="!quote.permission" class="pending">Waiting for the author's permission (shown in development only)</span>
      </p>
    </figure>
  </section>
</template>

<style scoped>
.record {
  max-width: 1120px;
  margin: 0 auto;
  padding: 72px 0 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 40px;
  align-items: center;
}
.eyebrow {
  margin: 0;
  font: 700 0.78rem ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.title {
  margin: 14px 0 0;
  font-size: clamp(2rem, 4.4vw, 3.4rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.02;
}
.by {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 26px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.by b, .card-head b { display: block; }
.by small, .card-head small {
  color: var(--muted);
  font: 0.78rem ui-monospace, monospace;
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  background: var(--pink-soft);
  color: var(--pink-dark);
  flex-shrink: 0;
}
.card {
  margin: 0;
  padding: 22px 24px;
  border-radius: 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.12), 0 -40px 80px -40px color-mix(in srgb, #f6c945 35%, transparent);
}
.card-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.original {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 700;
}
blockquote {
  margin: 16px 0 0;
  font-size: 1.12rem;
  line-height: 1.55;
}
blockquote p {
  margin: 0 0 12px;
}
mark {
  background: #f6e27a;
  color: #2f2d2b;
  padding: 0 2px;
  border-radius: 3px;
}
.foot {
  margin: 6px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.82rem;
}
.pending {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px dashed var(--muted);
  font-size: 0.72rem;
}
@media (max-width: 800px) {
  .record { grid-template-columns: 1fr; gap: 22px; padding-top: 48px; }
}
</style>
