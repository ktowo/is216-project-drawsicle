<script setup>
import { ref, watch, useId } from 'vue';
import { Loader2, Brush } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { PROGRESS_STAGES, LIMITS } from '@shared/constants.mjs';
import { timeAgo } from '@/utils/format';

// "How's it going?" for the person making a gift. Organisers see the stage, so they know who
// might need a nudge (or a backup artist) before the deadline.
const props = defineProps({
  url: { type: String, required: true }, // PUT .../my-match/progress or .../backups/:id/progress
  progress: { type: Object, default: null },
});
const emit = defineEmits(['saved']);

const uid = useId();
const stage = ref('');
const note = ref('');
const saving = ref(false);

watch(
  () => props.progress,
  (p) => {
    stage.value = p?.stage || '';
    note.value = p?.note || '';
  },
  { immediate: true }
);

async function save() {
  if (!stage.value) return;
  saving.value = true;
  try {
    const { progress } = await api(props.url, { method: 'PUT', body: { stage: stage.value, note: note.value.trim() } });
    emit('saved', progress);
    toast.success('Thanks! The organisers can see how you are getting on.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card panel progress" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="title"><Brush :size="18" aria-hidden="true" /> How's it going?</h2>
    <p class="hint m-0">Only the organisers see this. It helps them spot who might need a hand.</p>
    <div class="stages" role="radiogroup" :aria-labelledby="`${uid}-title`">
      <button
        v-for="s in PROGRESS_STAGES"
        :key="s.value"
        type="button"
        role="radio"
        class="stage"
        :class="{ on: stage === s.value }"
        :aria-checked="stage === s.value ? 'true' : 'false'"
        @click="stage = s.value"
      >
        {{ s.label }}
      </button>
    </div>
    <label :for="`${uid}-note`" class="sr-only">A note for the organisers</label>
    <input
      :id="`${uid}-note`"
      v-model="note"
      class="note"
      :maxlength="LIMITS.progressNote"
      placeholder="Anything they should know? (optional)"
    />
    <div class="row">
      <button type="button" class="btn btn-primary btn-sm" :disabled="!stage || saving" @click="save">
        <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" /> Update
      </button>
      <span v-if="progress?.at" class="when">Last updated {{ timeAgo(progress.at) }}</span>
    </div>
  </section>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px 24px;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.stages {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.stage {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.stage.on {
  border-color: var(--pink);
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.note {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.note:focus {
  outline: none;
  border-color: var(--pink);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.when {
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
