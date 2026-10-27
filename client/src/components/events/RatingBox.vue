<script setup>
import { ref, computed, watch, useId } from 'vue';
import { Star, Loader2, Pencil, Trash2 } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { LIMITS } from '@shared/constants.mjs';
import StarDisplay from '@/components/ui/StarDisplay.vue';
import PersonLink from '@/components/events/PersonLink.vue';

// After the reveal: rate how the organiser ran the exchange (1 to 5 stars and an optional comment).
// Only people who took part can rate; for everyone else this box stays out of the way.
const props = defineProps({ eventId: { type: String, required: true } });
const emit = defineEmits(['saved']);

const uid = useId();
const loading = ref(true);
const organiser = ref(null);
const summary = ref({ average: null, count: 0 });
const rating = ref(null); // my saved rating
const canRate = ref(false);

const editing = ref(false);
const stars = ref(0);
const hover = ref(0);
const comment = ref('');
const saving = ref(false);
const error = ref('');

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const shownStars = computed(() => hover.value || stars.value);
const visible = computed(() => !loading.value && (canRate.value || Boolean(rating.value)));

async function load() {
  loading.value = true;
  try {
    const data = await api(`/events/${props.eventId}/rating`);
    organiser.value = data.organiser;
    summary.value = data.summary;
    rating.value = data.rating;
    canRate.value = data.canRate;
    editing.value = data.canRate && !data.rating;
  } catch {
    // Nothing useful to show: the box just doesn't appear
    canRate.value = false;
    rating.value = null;
  } finally {
    loading.value = false;
  }
}
watch(() => props.eventId, load, { immediate: true });

function startEdit() {
  stars.value = rating.value?.stars || 0;
  comment.value = rating.value?.comment || '';
  error.value = '';
  editing.value = true;
}

// Arrow keys move between the stars, like any group of radio buttons
function onKey(event, n) {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  stars.value = Math.min(5, Math.max(1, (stars.value || n) + step));
  document.getElementById(`${uid}-star-${stars.value}`)?.focus();
}

async function save() {
  error.value = '';
  if (!stars.value) {
    error.value = 'Pick 1 to 5 stars first.';
    return;
  }
  saving.value = true;
  try {
    const data = await api(`/events/${props.eventId}/rating`, {
      method: 'PUT',
      body: { stars: stars.value, comment: comment.value.trim() },
    });
    rating.value = data.rating;
    summary.value = data.summary;
    editing.value = false;
    emit('saved', data);
    toast.success('Thanks! Your rating was saved.');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  saving.value = true;
  try {
    const data = await api(`/events/${props.eventId}/rating`, { method: 'DELETE' });
    rating.value = null;
    summary.value = data.summary;
    stars.value = 0;
    comment.value = '';
    editing.value = canRate.value;
    emit('saved', data);
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-if="visible" class="card panel rating-box" :aria-labelledby="`${uid}-heading`">
    <div class="head">
      <span class="icon-tile soft" aria-hidden="true"><Star :size="22" /></span>
      <div>
        <h2 :id="`${uid}-heading`" class="panel-title">
          How was <PersonLink v-if="organiser" :user="organiser" :size="0" /><template v-else>the organiser</template>?
        </h2>
        <p class="sub">Your rating helps new artists see who runs a friendly, reliable exchange.</p>
      </div>
    </div>

    <!-- My saved rating -->
    <div v-if="rating && !editing" class="mine">
      <p class="mine-head">
        <StarDisplay :value="rating.stars" :count="1" :show-text="false" :size="22" />
        <strong>You gave {{ rating.stars }} {{ rating.stars === 1 ? 'star' : 'stars' }}</strong>
        <span class="muted">({{ LABELS[rating.stars] }})</span>
      </p>
      <p v-if="rating.comment" class="comment">{{ rating.comment }}</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="startEdit">
          <Pencil :size="14" aria-hidden="true" /> Edit
        </button>
        <button type="button" class="btn btn-ghost btn-xs btn-danger-text" :disabled="saving" @click="remove">
          <Trash2 :size="14" aria-hidden="true" /> Remove
        </button>
      </div>
    </div>

    <!-- Rating form -->
    <form v-else class="form" novalidate @submit.prevent="save">
      <p :id="`${uid}-label`" class="form-title">Your rating</p>
      <div class="picker" role="radiogroup" :aria-labelledby="`${uid}-label`" @mouseleave="hover = 0">
        <button
          v-for="n in 5"
          :id="`${uid}-star-${n}`"
          :key="n"
          type="button"
          role="radio"
          class="star-btn"
          :class="{ on: n <= shownStars }"
          :aria-checked="stars === n ? 'true' : 'false'"
          :aria-label="`${n} ${n === 1 ? 'star' : 'stars'}, ${LABELS[n]}`"
          :tabindex="stars === n || (!stars && n === 1) ? 0 : -1"
          @click="stars = n"
          @mouseenter="hover = n"
          @focus="hover = 0"
          @keydown="onKey($event, n)"
        >
          <Star :size="30" aria-hidden="true" />
        </button>
        <span class="word" aria-hidden="true">{{ LABELS[shownStars] }}</span>
      </div>

      <label :for="`${uid}-comment`" class="sr-only">Comment (optional)</label>
      <textarea
        :id="`${uid}-comment`"
        v-model="comment"
        class="note-input"
        rows="3"
        :maxlength="LIMITS.ratingComment"
        placeholder="Anything you'd like to say? (optional) Comments show on their profile, without your name."
      />
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">
          <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" />
          {{ rating ? 'Save' : 'Send rating' }}
        </button>
        <button v-if="rating" type="button" class="btn btn-ghost btn-sm" @click="editing = false">Cancel</button>
      </div>
    </form>

    <p class="average">
      <span class="muted">All ratings:</span>
      <StarDisplay :value="summary.average" :count="summary.count" :size="16" />
    </p>
  </section>
</template>

<style scoped>
.rating-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.panel-title {
  margin: 0;
}
.sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.muted {
  color: var(--muted);
}
.mine-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
}
.comment {
  margin: 8px 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-title {
  margin: 0;
  font-weight: 700;
  color: var(--pink-dark);
}
.picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.star-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--border-strong);
  cursor: pointer;
  transition: transform 0.1s;
}
.star-btn.on {
  color: var(--warning);
}
.star-btn.on :deep(svg) {
  fill: currentColor;
}
.star-btn:hover {
  transform: scale(1.1);
}
.star-btn:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.word {
  margin-left: 8px;
  font-weight: 600;
  color: var(--text-soft);
}
.note-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  resize: vertical;
}
.note-input:focus {
  outline: none;
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft);
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.average {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  font-size: 0.92rem;
}
@media (prefers-reduced-motion: reduce) {
  .star-btn {
    transition: none;
  }
}
</style>
