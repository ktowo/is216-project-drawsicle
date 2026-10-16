<script setup>
import { computed } from 'vue';
import { iso } from '@/museum/iso';
import { boxFaces, boxRect } from '@/museum/furniture';

// One slice of furniture (see museum/furniture.js), in the room design's colours.
// dim: how brightly it's lit (1 is fully lit; darker rooms pass less)
const props = defineProps({
  slice: { type: Object, required: true },
  theme: { type: Object, required: true },
  dim: { type: Number, default: 1 },
});

const t = computed(() => props.slice.tile);
const centre = computed(() => iso(t.value.x + 0.5, t.value.y + 0.5));
const colours = computed(() => props.theme[props.slice.kind] || props.theme.bench);

// Plants, the sculpture, the lamp, the cat bed and the guestbook: all one tile each
const shape = computed(() => {
  const { x, y } = t.value;
  switch (props.slice.kind) {
    case 'plant':
      return { pot: boxFaces(x, y, 1, 1, 18, 0.3) };
    case 'pedestal':
      return { stand: boxFaces(x, y, 1, 1, 36, 0.2) };
    case 'lamp':
      return { table: boxFaces(x, y, 1, 1, 22, 0.24), leg: boxFaces(x, y, 1, 1, 2, 0.4) };
    case 'catbed':
      return { base: boxFaces(x, y, 1, 1, 7, 0.12), cushion: boxRect(x + 0.24, y + 0.24, x + 0.76, y + 0.76, 9) };
    case 'guestbook':
      return { post: boxFaces(x, y, 1, 1, 30, 0.4), foot: boxFaces(x, y, 1, 1, 4, 0.22) };
    default:
      return null;
  }
});
const style = computed(() => (props.dim < 1 ? { filter: `brightness(${props.dim})` } : undefined));
</script>

<template>
  <g :style="style">
    <!-- A seat or a backrest -->
    <template v-if="slice.part === 'seat' || slice.part === 'back'">
      <polygon :points="slice.faces.left" :fill="colours[0]" />
      <polygon :points="slice.faces.right" :fill="colours[1]" />
      <polygon :points="slice.faces.top" :fill="colours[2]" />
    </template>

    <template v-else-if="slice.kind === 'plant'">
      <polygon :points="shape.pot.left" :fill="theme.pot[0]" />
      <polygon :points="shape.pot.right" :fill="theme.pot[1]" />
      <polygon :points="shape.pot.top" :fill="theme.pot[2]" />
      <ellipse :cx="centre.x - 9" :cy="centre.y - 34" rx="9" ry="14" fill="#3f9b5f" />
      <ellipse :cx="centre.x + 9" :cy="centre.y - 32" rx="9" ry="13" fill="#4fb36f" />
      <ellipse :cx="centre.x" :cy="centre.y - 46" rx="9" ry="15" fill="#5cc27c" />
    </template>

    <template v-else-if="slice.kind === 'pedestal'">
      <polygon :points="shape.stand.left" :fill="theme.pedestal[0]" />
      <polygon :points="shape.stand.right" :fill="theme.pedestal[1]" />
      <polygon :points="shape.stand.top" :fill="theme.pedestal[2]" />
      <circle :cx="centre.x" :cy="centre.y - 52" r="11" :fill="theme.sculpture[0]" />
      <circle :cx="centre.x + 7" :cy="centre.y - 62" r="6" :fill="theme.sculpture[1]" />
      <rect :x="centre.x - 3" :y="centre.y - 44" width="6" height="8" :fill="theme.sculpture[0]" class="shade" />
    </template>

    <!-- A little round-shouldered table with a lamp on it -->
    <template v-else-if="slice.kind === 'lamp'">
      <polygon :points="shape.table.left" :fill="theme.bench[0]" />
      <polygon :points="shape.table.right" :fill="theme.bench[1]" />
      <polygon :points="shape.table.top" :fill="theme.bench[2]" />
      <rect :x="centre.x - 1.5" :y="centre.y - 42" width="3" height="20" fill="#3a3340" />
      <ellipse :cx="centre.x" :cy="centre.y - 23" rx="6" ry="2.5" fill="#3a3340" />
      <polygon
        :points="`${centre.x - 7},${centre.y - 40} ${centre.x + 7},${centre.y - 40} ${centre.x + 11},${centre.y - 30} ${centre.x - 11},${centre.y - 30}`"
        fill="#fbe2a6"
      />
      <polygon
        :points="`${centre.x - 11},${centre.y - 30} ${centre.x + 11},${centre.y - 30} ${centre.x + 10},${centre.y - 28} ${centre.x - 10},${centre.y - 28}`"
        fill="#e7c47a"
      />
    </template>

    <!-- The cats' bed: a low basket with a cushion -->
    <template v-else-if="slice.kind === 'catbed'">
      <polygon :points="shape.base.left" fill="#b98b62" />
      <polygon :points="shape.base.right" fill="#a07650" />
      <polygon :points="shape.base.top" fill="#cfa47a" />
      <polygon :points="shape.cushion.top" :fill="theme.rug[0]" />
    </template>

    <!-- The guestbook on its stand -->
    <template v-else-if="slice.kind === 'guestbook'">
      <polygon :points="shape.foot.left" :fill="theme.bench[0]" />
      <polygon :points="shape.foot.right" :fill="theme.bench[1]" />
      <polygon :points="shape.foot.top" :fill="theme.bench[2]" />
      <polygon :points="shape.post.left" :fill="theme.bench[0]" />
      <polygon :points="shape.post.right" :fill="theme.bench[1]" />
      <polygon
        :points="`${centre.x - 16},${centre.y - 34} ${centre.x},${centre.y - 42} ${centre.x + 16},${centre.y - 34} ${centre.x},${centre.y - 27}`"
        :fill="theme.bench[2]"
      />
      <polygon
        :points="`${centre.x - 13},${centre.y - 36} ${centre.x - 1},${centre.y - 41.5} ${centre.x - 1},${centre.y - 30} ${centre.x - 11},${centre.y - 33}`"
        fill="#fffaf0"
      />
      <polygon
        :points="`${centre.x + 1},${centre.y - 41.5} ${centre.x + 13},${centre.y - 36} ${centre.x + 11},${centre.y - 33} ${centre.x + 1},${centre.y - 30}`"
        fill="#f6efe2"
      />
      <path :d="`M ${centre.x - 9} ${centre.y - 36} l 6 -2.6 M ${centre.x - 9} ${centre.y - 34} l 6 -2.6 M ${centre.x + 4} ${centre.y - 38} l 6 2.6`" stroke="#b9ad98" stroke-width="0.8" />
      <rect :x="centre.x + 8" :y="centre.y - 46" width="1.4" height="10" rx="0.7" fill="#ec6a93" />
    </template>
  </g>
</template>

<style scoped>
.shade {
  filter: brightness(0.85);
}
</style>
