<script setup>
import { useId } from 'vue';
import StarDisplay from '@/components/ui/StarDisplay.vue';
import { formatDate } from '@/utils/format';

// How artists rated this person as an organiser: the average, and a few anonymous comments.
//   rating: { average, count, recent: [{ stars, comment, eventName, at }] }
defineProps({ rating: { type: Object, required: true } });

const uid = useId();
</script>

<template>
  <div v-if="rating.count" class="organiser-rating" role="group" :aria-labelledby="`${uid}-title`">
    <div class="top">
      <p :id="`${uid}-title`" class="title">Rated by artists who joined their events</p>
      <StarDisplay :value="rating.average" :count="rating.count" :size="20" />
    </div>
    <ul v-if="rating.recent?.length" class="comments">
      <li v-for="(c, i) in rating.recent" :key="i" class="comment">
        <StarDisplay :value="c.stars" :count="1" :show-text="false" :size="14" />
        <p class="text">“{{ c.comment }}”</p>
        <p class="meta">An artist from {{ c.eventName }}<template v-if="c.at"> · {{ formatDate(c.at) }}</template></p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.organiser-rating {
  margin-bottom: 18px;
  padding: 16px 18px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.title {
  margin: 0;
  font-weight: 700;
  color: var(--pink-dark);
}
.comments {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.comment {
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.text {
  margin: 4px 0 2px;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
</style>
