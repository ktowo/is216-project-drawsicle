<script setup>
import EventCard from './EventCard.vue';

    const props = defineProps({
        previewEvent: {required: true},
        previewFacts: {required: true},
        form: {required: true}
    })
</script>

<template>
    <section aria-labelledby="preview-title">
        <h2 id="preview-title" class="aside-title">Preview</h2>
        <p class="hint m-0">How your event looks on Browse events.</p>
        <div class="preview-frame" inert>
            <EventCard :event="previewEvent" />
        </div>
        <dl class="preview-facts">
            <div v-for="fact in previewFacts" :key="fact.label">
                <dt>{{ fact.label }}</dt>
                <dd>{{ fact.value }}</dd>
            </div>
        </dl>
        <ul v-if="form.tags.length" class="preview-tags" aria-label="Tags">
            <li v-for="tag in form.tags" :key="tag" class="badge badge-muted">{{ tag }}</li>
        </ul>
    </section>
</template>

<style scoped>
/* ---------- Live preview ---------- */
.preview-frame {
  margin-top: 12px;
  pointer-events: none;
}
.preview-facts {
  margin: 14px 0 0;
  display: grid;
  gap: 10px;
}
.preview-facts > div {
  display: grid;
  gap: 2px;
}
.preview-facts dt {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
}
.preview-facts dd {
  margin: 0;
  font-weight: 600;
}
.preview-tags {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>