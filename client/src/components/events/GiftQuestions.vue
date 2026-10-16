<script setup>
import { ref, computed, useId } from 'vue';
import { MessageCircleQuestion, Loader2, Send, EyeOff } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { timeAgo, formatDateTime } from '@/utils/format';
import { GIFT_QUESTIONS, askingProblem } from '@shared/gift-questions.mjs';

// The secret artist's side of the questions (shared/gift-questions.mjs): ask the person you're
// making a gift for something, and see their answers. They never learn who asked.
//   endpoint: where questions are sent (/my-match/questions, or a backup's)
const props = defineProps({
  questions: { type: Array, default: () => [] },
  endpoint: { type: String, required: true },
  recipientName: { type: String, required: true },
  canAsk: { type: Boolean, default: true },
});
const emit = defineEmits(['update:questions']);

const uid = useId();
const text = ref('');
const sending = ref(false);
const problem = ref('');
const blocked = computed(() => askingProblem(props.questions));

async function ask() {
  if (sending.value || text.value.trim().length < 3) return;
  sending.value = true;
  problem.value = '';
  try {
    const { questions } = await api(props.endpoint, { method: 'POST', body: { text: text.value } });
    emit('update:questions', questions);
    text.value = '';
    toast.success(`Sent! ${props.recipientName} will see it without your name.`);
  } catch (e) {
    problem.value = e.message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section v-if="canAsk || questions.length" class="card panel" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="panel-title">
      <MessageCircleQuestion :size="20" aria-hidden="true" /> Ask {{ recipientName }}
    </h2>
    <p class="muted intro">
      <EyeOff :size="15" aria-hidden="true" /> Not sure about something? Ask. They answer without ever seeing who asked.
    </p>

    <ol v-if="questions.length" class="thread">
      <li v-for="q in questions" :key="q.id" class="qa">
        <p class="q">
          <span class="who">You asked</span>
          <time :datetime="q.askedAt" :title="formatDateTime(q.askedAt)">{{ timeAgo(q.askedAt) }}</time>
          <span class="body">{{ q.text }}</span>
        </p>
        <p v-if="q.answer" class="a">
          <span class="who">{{ recipientName }}</span>
          <time :datetime="q.answeredAt" :title="formatDateTime(q.answeredAt)">{{ timeAgo(q.answeredAt) }}</time>
          <span class="body">{{ q.answer }}</span>
        </p>
        <p v-else class="waiting">Waiting for {{ recipientName }} to answer…</p>
      </li>
    </ol>

    <form v-if="canAsk" class="ask" @submit.prevent="ask">
      <label :for="`${uid}-text`" class="sr-only">Your question for {{ recipientName }}</label>
      <textarea
        :id="`${uid}-text`"
        v-model="text"
        rows="2"
        :maxlength="GIFT_QUESTIONS.textMax"
        :disabled="Boolean(blocked)"
        :placeholder="`e.g. Would you like ${recipientName}'s character in a cosy or an action scene?`"
        :aria-describedby="`${uid}-hint`"
      />
      <div class="ask-row">
        <span :id="`${uid}-hint`" class="muted small">
          {{ blocked || `${text.length}/${GIFT_QUESTIONS.textMax}` }}
        </span>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || Boolean(blocked) || text.trim().length < 3">
          <Loader2 v-if="sending" :size="15" class="spin" aria-hidden="true" />
          <Send v-else :size="15" aria-hidden="true" />
          Ask anonymously
        </button>
      </div>
      <p v-if="problem" class="error small" role="alert">{{ problem }}</p>
    </form>
  </section>
</template>

<style scoped>
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.intro {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
}
.thread {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qa {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  max-width: 90%;
}
.q {
  align-self: flex-end;
  background: var(--pink-soft);
  border-bottom-right-radius: 4px;
}
.a {
  align-self: flex-start;
  background: var(--surface-2);
  border-bottom-left-radius: 4px;
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
.waiting {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  font-style: italic;
}
.ask textarea {
  width: 100%;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.ask-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.error {
  margin: 8px 0 0;
  color: var(--danger, #c4314f);
}
</style>
