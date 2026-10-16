<script setup>
import { ref, reactive, onMounted, useId } from 'vue';
import { MessageCircleQuestion, Loader2 } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { timeAgo, formatDateTime } from '@/utils/format';
import { GIFT_QUESTIONS } from '@shared/gift-questions.mjs';

// Questions from whoever is making your gift (shared/gift-questions.mjs). You answer here and
// never find out who asked, until the reveal. Shows nothing until there's a question.
const props = defineProps({
  event: { type: Object, required: true },
});

const uid = useId();
const questions = ref([]);
const canAnswer = ref(false);
const drafts = reactive({}); // question id -> answer being written
const editing = reactive({}); // question id -> true while changing an answer
const saving = ref('');

onMounted(async () => {
  try {
    const data = await api(`/events/${props.event.id}/questions-for-me`);
    questions.value = data.questions;
    canAnswer.value = data.canAnswer;
  } catch {
    // Nothing to show; the rest of the page carries on
  }
});

function startEditing(q) {
  drafts[q.id] = q.answer;
  editing[q.id] = true;
}

async function answer(q) {
  const text = (drafts[q.id] || '').trim();
  if (!text || saving.value) return;
  saving.value = q.id;
  try {
    const { question } = await api(`/events/${props.event.id}/questions-for-me/${q.id}/answer`, {
      method: 'POST',
      body: { answer: text },
    });
    questions.value = questions.value.map((x) => (x.id === q.id ? question : x));
    editing[q.id] = false;
    drafts[q.id] = '';
    toast.success('Answer sent to your secret artist.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = '';
  }
}
</script>

<template>
  <section v-if="questions.length" id="gift-questions" class="card panel" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="panel-title">
      <MessageCircleQuestion :size="22" class="title-icon" aria-hidden="true" /> Questions from your secret artist
    </h2>
    <p class="muted intro">Whoever is making your gift wants to get it just right. They'll see your answers; you'll find out who they are at the reveal.</p>

    <ol class="questions">
      <li v-for="q in questions" :key="q.id" class="question">
        <p class="q">
          <time :datetime="q.askedAt" :title="formatDateTime(q.askedAt)">Asked {{ timeAgo(q.askedAt) }}</time>
          <span class="body">{{ q.text }}</span>
        </p>

        <form v-if="canAnswer && (!q.answer || editing[q.id])" class="answer-form" @submit.prevent="answer(q)">
          <label :for="`${uid}-${q.id}`" class="sr-only">Your answer</label>
          <textarea
            :id="`${uid}-${q.id}`"
            v-model="drafts[q.id]"
            rows="2"
            :maxlength="GIFT_QUESTIONS.answerMax"
            placeholder="Your answer…"
          />
          <div class="row">
            <button v-if="editing[q.id]" type="button" class="btn btn-ghost btn-sm" @click="editing[q.id] = false">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="saving === q.id || !(drafts[q.id] || '').trim()">
              <Loader2 v-if="saving === q.id" :size="15" class="spin" aria-hidden="true" /> {{ q.answer ? 'Save answer' : 'Answer' }}
            </button>
          </div>
        </form>
        <div v-else-if="q.answer" class="a">
          <span class="who">You answered</span>
          <span class="body">{{ q.answer }}</span>
          <button v-if="canAnswer" type="button" class="link-button" @click="startEditing(q)">Change</button>
        </div>
        <p v-else class="muted small">Answers closed when the gifts were handed in.</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.intro {
  margin: 0 0 12px;
}
.questions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.question {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q,
.a {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
}
.q {
  background: var(--surface-2);
  border-bottom-left-radius: 4px;
}
.a {
  align-self: flex-end;
  max-width: 90%;
  background: var(--pink-soft);
  border-bottom-right-radius: 4px;
}
.who {
  font-size: 0.8rem;
  font-weight: 800;
}
time {
  color: var(--muted);
  font-size: 0.75rem;
}
.body {
  flex-basis: 100%;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.answer-form textarea {
  width: 100%;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--pink-dark);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
</style>
