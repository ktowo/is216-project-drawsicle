<script setup>
import { ref, computed, watch } from 'vue';
import { Snowflake, Flower2, Sun, Leaf, Heart, Ghost, Gift, Palette } from 'lucide-vue-next';
import { assetUrl } from '@/api';

const props = defineProps({
  event: { type: Object, default: null },
  height: { type: Number, default: 180 },
});

// Soft colours per season for events without an uploaded banner
const THEMES = {
  winter: { colors: ['#cfe3f8', '#a7c7ee', '#eef5fd'], icon: Snowflake },
  spring: { colors: ['#d6efcb', '#f9cfe0', '#fff5d9'], icon: Flower2 },
  summer: { colors: ['#ffe29a', '#ffbb8c', '#fff3d4'], icon: Sun },
  autumn: { colors: ['#f5c48f', '#e39a6c', '#fbe6cd'], icon: Leaf },
  valentine: { colors: ['#fbc3d6', '#f08cae', '#fde6ee'], icon: Heart },
  halloween: { colors: ['#f6b26b', '#bba0dc', '#fbe2c5'], icon: Ghost },
  christmas: { colors: ['#f3a7a7', '#a9d6b2', '#fdebea'], icon: Gift },
  other: { colors: ['#fbd5e2', '#f4b8cc', '#faf3e8'], icon: Palette },
};

const failed = ref(false);
watch(() => props.event?.bannerUrl, () => (failed.value = false));

const src = computed(() => (props.event?.bannerUrl && !failed.value ? assetUrl(props.event.bannerUrl) : ''));

// Same event, same picture: everything below comes from a hash of the id.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const theme = computed(() => THEMES[props.event?.season] || THEMES.other);

const placeholderStyle = computed(() => {
  const seed = hash(String(props.event?.id || props.event?.name || 'event'));
  const [a, b, c] = theme.value.colors;
  const angle = seed % 360;
  const x1 = 10 + (seed % 35);
  const y1 = 15 + ((seed >>> 5) % 50);
  const x2 = 60 + ((seed >>> 9) % 35);
  const y2 = 30 + ((seed >>> 13) % 55);
  return {
    backgroundImage: [
      `radial-gradient(circle at ${x1}% ${y1}%, ${b} 0, transparent 42%)`,
      `radial-gradient(circle at ${x2}% ${y2}%, ${a} 0, transparent 46%)`,
      `linear-gradient(${angle}deg, ${c}, ${a})`,
    ].join(', '),
  };
});

const motifs = computed(() => {
  const seed = hash(`${props.event?.id || ''}${props.event?.season || ''}`);
  const size = Math.max(28, Math.round(props.height * 0.34));
  return [
    { left: 8 + (seed % 20), top: 18 + ((seed >>> 4) % 30), size: Math.round(size * 0.6), rotate: (seed >>> 8) % 40 - 20, opacity: 0.55 },
    { left: 62 + ((seed >>> 3) % 22), top: 22 + ((seed >>> 7) % 26), size, rotate: (seed >>> 11) % 50 - 25, opacity: 0.75 },
    { left: 38 + ((seed >>> 6) % 14), top: 58 + ((seed >>> 10) % 16), size: Math.round(size * 0.42), rotate: (seed >>> 14) % 60 - 30, opacity: 0.45 },
  ];
});
</script>

<template>
  <div class="event-banner" :style="{ height: `${height}px` }">
    <img v-if="src" :src="src" alt="" class="banner-img" loading="lazy" @error="failed = true" />
    <div v-else class="banner-placeholder" :style="placeholderStyle" aria-hidden="true">
      <component
        :is="theme.icon"
        v-for="(m, i) in motifs"
        :key="i"
        class="motif"
        :size="m.size"
        :stroke-width="1.6"
        :style="{ left: `${m.left}%`, top: `${m.top}%`, opacity: m.opacity, transform: `translate(-50%, -50%) rotate(${m.rotate}deg)` }"
      />
    </div>
  </div>
</template>

<style scoped>
.event-banner {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--pink-soft);
}
.banner-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.banner-placeholder {
  position: absolute;
  inset: 0;
}
.motif {
  position: absolute;
  color: #fff;
  filter: drop-shadow(0 2px 6px rgba(90, 65, 30, 0.12));
}
</style>
