<script setup>
import { computed } from 'vue';
import { Star } from 'lucide-vue-next';
import { pluralize } from '@/utils/format';

// Five stars showing an average (read-only), with the number and how many ratings it comes from.
//   <StarDisplay :value="4.5" :count="8" />        4.5 stars, 8 ratings
//   <StarDisplay :value="null" />                  No ratings yet
const props = defineProps({
  value: { type: Number, default: null }, // average from 1 to 5, or null when nobody has rated
  count: { type: Number, default: 0 },
  size: { type: Number, default: 18 },
  showText: { type: Boolean, default: true },
});

// Stars light up for the nearest whole number (4.4 shows 4, 4.5 shows 5)
const filled = computed(() => (props.value == null ? 0 : Math.round(props.value)));
</script>

<template>
  <span class="star-display">
    <span class="stars" aria-hidden="true">
      <Star v-for="n in 5" :key="n" :size="size" :class="{ on: n <= filled }" />
    </span>
    <span v-if="showText" class="text">
      <template v-if="value == null">No ratings yet</template>
      <template v-else>
        <strong>{{ value.toFixed(1) }}</strong>
        <span class="sr-only"> out of 5 stars,</span>
        ({{ pluralize(count, 'rating') }})
      </template>
    </span>
    <span v-else class="sr-only">
      {{ value == null ? 'No ratings yet' : `${value.toFixed(1)} out of 5 stars from ${pluralize(count, 'rating')}` }}
    </span>
  </span>
</template>

<style scoped>
.star-display {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.stars {
  display: inline-flex;
  gap: 2px;
  color: var(--border-strong);
}
.stars .on {
  color: var(--warning);
  fill: currentColor;
}
.text {
  color: var(--text-soft);
  font-size: 0.92rem;
}
.text strong {
  color: var(--text);
}
</style>
