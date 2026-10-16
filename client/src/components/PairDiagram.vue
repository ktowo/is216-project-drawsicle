<script setup>
import { ref, computed, onUpdated, onBeforeUpdate, onBeforeMount, onMounted } from 'vue';

const props = defineProps({
    chain: {
        type: [{ name: String, avatar: String }],
        required: true
    },
    initialAngle: {
        type: Number,
        default: 0
    }
})

const avatarDiameter = 64; // px
const diagramFrame = ref(null);
const diagramWidth = ref(0);
const radius = computed(() => {
    return (diagramWidth.value - avatarDiameter) / 2;
});

const positions = computed(() => {
    let result = [];

    for (const i in props.chain) {
        const r = radius.value;
        const angle = 2 * Math.PI * (i / props.chain.length + props.initialAngle / 360);

        result.push({
            x: `${Math.cos(angle) * r + r}px`,
            y: `${Math.sin(angle) * r + r}px`
        });
    }

    return result;
})

// change larger radius for every change in component width
function updateDiagramWidth() {
    if (diagramFrame.value) {
        const computedStyle = window.getComputedStyle(diagramFrame.value);
        diagramWidth.value = parseFloat(computedStyle.width);
    }
}

onMounted(updateDiagramWidth)

window.addEventListener('resize', (e) => updateDiagramWidth());
</script>

<template>
    <div ref="diagramFrame" id="main-frame" class="relative aspect-square w-auto">
        <div class="flex absolute" :style="{ left: positions[i].x, bottom: positions[i].y }"
            v-for="(artist, i) in chain">
            <div class="profile-pic rounded-full aspect-square"></div>
            <!-- <img :src="artist.avatar" width="64", height="64" class="rounded-full aspect-square"> -->
            <span>{{ artist.name }}</span>
        </div>
    </div>
</template>

<style scoped>
.profile-pic {
    width: 64px;
    background-color: red;
}
</style>