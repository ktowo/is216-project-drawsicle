<script setup>
import { computed, ref } from "vue";
import RecentActivity from "@/components/dashboard/RecentActivity.vue";
import ProgressBar from "@/components/ProgressBar.vue";
import YourMatch from "@/components/mocks/YourMatch.vue";
import Event from "@/components/mocks/Event.vue";

const SLIDES = [
	{ 
		mock: Event, 
		title: "Welcome to Drawsicle!",
		subtitle: "lorem ipsum dolor sit amet"
	},
	{ 
		mock: RecentActivity, 
		title: "Cuteness overload!",
		subtitle: "mitochondria is the powerhouse of the cell"
	},
	{ 
		mock: YourMatch, 
		title: "Welcome to Drawsicle!",
		subtitle: "lorem ipsum dolor sit amet"
	}
]
const currentSlideNumber = ref(0);
const currentSlide = computed(() => SLIDES[currentSlideNumber.value])
const progressPercentage = computed(() => ((currentSlideNumber.value + 1) / SLIDES.length) * 100 )
const isFirstSlide = computed(() => currentSlideNumber.value == 0);
const isLastSlide = computed(() => currentSlideNumber.value == SLIDES.length - 1);

function nextSlide(e) {
	if (!isLastSlide.value) {
		currentSlideNumber.value++;
	}
}
function prevSlide(e) {
	if (!isFirstSlide.value) {
		currentSlideNumber.value--;
	}
}
</script>

<template>
  <main id="main" class="page main-page">
		<div class="illustration">
			<component :is="currentSlide.mock"></component>
			<div class="description">
				<h1>{{ currentSlide.title }}</h1>
				<h3 v-if="currentSlide.subtitle">{{ currentSlide.subtitle }}</h3>
			</div>
		</div>

		<div class="nav">
			<button class="btn" :class="{'btn-primary': !isFirstSlide}" :disabled="isFirstSlide" @click="prevSlide"><</button>
			<ProgressBar :progress="progressPercentage"></ProgressBar>
			<button class="btn" :class="{'btn-primary': !isLastSlide}" :disabled="isLastSlide" @click="nextSlide">></button>
		</div>
  </main>
</template>

<style scoped>
.main-page {
  max-width: 1040px;
  min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2rem;
}
.illustration {
	flex-grow: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	gap: 2rem;
}
.description {
	text-align: center;
}
.nav {
	width: 100%;
	max-width: 36rem;
	display: grid;
	grid-template-columns: auto 1fr auto;
	align-items: center;
	gap: 1rem;
}
</style>