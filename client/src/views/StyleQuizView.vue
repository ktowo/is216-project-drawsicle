<script setup>
import { play } from '@/effects/sfx';
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Sparkles, Save, Loader2, RotateCcw, UsersRound, Check } from 'lucide-vue-next';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import ArtistCard from '@/components/discover/ArtistCard.vue';
import EventCard from '@/components/events/EventCard.vue';
import CardColorPicker from '@/components/profile/CardColorPicker.vue';
import { api, qs } from '@/api';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { CREATION_TYPES } from '@shared/constants.mjs';
import { THEMES, THEMES_MAX, ACTIVITY_LEVELS } from '@shared/taste.mjs';
import {
  QUIZ_STEPS,
  loadQuiz,
  saveQuiz,
  clearQuiz,
  emptyAnswers,
  hasAnswers,
  profileUpdateFrom,
  sameTags,
  tasteQuery,
} from '@/utils/styleQuiz';
import ProgressBar from '@/components/ProgressBar.vue';

// Find your style: five quick questions, with your artist card building up beside them.
// No account needed; answers stay in this browser until you save them to your profile.
const route = useRoute();
const router = useRouter();

const saved = loadQuiz();
const answers = reactive({ ...saved.answers });
const step = ref(saved.step); // 0..4 questions, 5 = result
const pendingSave = ref(saved.pendingSave);
const savedToProfile = ref(false);

const THEME_OPTIONS = THEMES.map(({ value, label }) => ({ value, label }));
const ACTIVITY_OPTIONS = ACTIVITY_LEVELS.map(({ value, label, description }) => ({ value, label: `${label} · ${description}` }));
const STEPS = [
  { key: 'makes', title: 'What do you make?', help: 'Pick everything you enjoy making for an exchange.' },
  { key: 'themes', title: 'What do you love?', help: `Up to ${THEMES_MAX} themes you'd happily draw or write about.` },
  { key: 'wants', title: 'What would you love to receive?', help: 'We use this to find artists who make it.' },
  { key: 'activity', title: 'How often do you join?', help: 'So organisers and other artists know what to expect.' },
  { key: 'cardColor', title: 'Pick your card colour', help: 'It follows you around: your profile, Discover and more.' },
];
const current = computed(() => STEPS[step.value] || null);
const onResult = computed(() => step.value >= QUIZ_STEPS);
// Ta-da when the artist card appears
watch(onResult, (now) => now && play('fanfare'));

const fullThemes = computed(() =>
  answers.themes.length >= THEMES_MAX ? THEMES.map((t) => t.value).filter((v) => !answers.themes.includes(v)) : []
);

// The live card: what Discover would show with these answers
const previewCard = computed(() => ({
  user: {
    id: auth.user?.id || 'you',
    displayName: auth.user?.displayName || 'You',
    username: auth.user?.username || '',
    avatarUrl: auth.user?.avatarUrl || null,
  },
  artistTags: { makes: answers.makes, themes: answers.themes, activity: answers.activity, cardColor: answers.cardColor },
  badges: [],
  gifts: [],
}));

watch(
  [answers, step, pendingSave],
  () => {
    // Once saved to the profile, the browser copy is gone for good
    if (savedToProfile.value) return;
    saveQuiz({ answers: { ...answers }, step: step.value, pendingSave: pendingSave.value });
  },
  { deep: true }
);

// Move focus to the new question so keyboard and screen reader users land in the right place
const heading = ref(null);
async function go(to) {
  step.value = Math.max(0, Math.min(QUIZ_STEPS, to));
  await nextTick();
  heading.value?.focus();
}
const next = () => go(step.value + 1);
const back = () => go(step.value - 1);
function restart() {
  savedToProfile.value = false;
  Object.assign(answers, emptyAnswers());
  pendingSave.value = false;
  clearQuiz();
  go(0);
}

// ---------- Suggestions on the result screen ----------

const suggestions = ref(null); // { artists, events } once loaded
const suggestionsError = ref('');
async function loadSuggestions() {
  suggestionsError.value = '';
  try {
    suggestions.value = await api(`/discover/recommendations${qs(tasteQuery(answers))}`);
  } catch (e) {
    suggestionsError.value = e.message || "Couldn't load suggestions.";
  }
}
watch(
  onResult,
  (now) => {
    if (now && hasAnswers(answers)) loadSuggestions();
  },
  { immediate: true }
);
function onFollowChanged({ username, following }) {
  const card = suggestions.value?.artists.find((c) => c.user.username === username);
  if (card) card.following = following;
}

// ---------- Saving ----------

const copyDefaults = ref(false);
const saving = ref(false);
const confirmOpen = ref(false);

const existingTags = computed(() => auth.user?.artistTags || null);
const wouldReplace = computed(() => {
  const t = existingTags.value;
  return Boolean(t && (t.makes.length || t.themes.length || t.activity || t.cardColor) && !sameTags(answers, t));
});

function requestSave() {
  if (wouldReplace.value) confirmOpen.value = true;
  else save();
}

async function save() {
  confirmOpen.value = false;
  saving.value = true;
  try {
    const { user } = await api('/profile', {
      method: 'PATCH',
      body: profileUpdateFrom(answers, { copyDefaults: copyDefaults.value }),
    });
    setUser(user);
    savedToProfile.value = true;
    pendingSave.value = false;
    clearQuiz();
    toast.success('Saved to your profile.');
  } catch (e) {
    toast.error(e.message || "Couldn't save your answers.");
  } finally {
    saving.value = false;
  }
}

// Logged out: remember to save once they're back from signing up or logging in
const comeBack = '/find-your-style?save=1';
function markPending() {
  pendingSave.value = true;
}

async function savePendingIfReady() {
  if (!auth.user || !pendingSave.value || !hasAnswers(answers)) return;
  step.value = QUIZ_STEPS;
  if (route.query.save) router.replace({ query: {} });
  requestSave();
}
onMounted(savePendingIfReady);
watch(() => auth.user?.id, savePendingIfReady);
</script>

<template>
  <main id="main" class="page quiz-page">
    <header class="quiz-head">
      <p class="eyebrow"><Sparkles :size="16" aria-hidden="true" /> Find your style</p>
      <p v-if="!onResult" class="progress-text" aria-live="polite">Question {{ step + 1 }} of {{ QUIZ_STEPS }}</p>
      <ProgressBar v-if="!onResult" class="progress" aria-hidden="true" :progress="((step + 1) / QUIZ_STEPS) * 100" />
    </header>

    <div class="quiz-layout">
      <!-- Questions -->
      <section v-if="!onResult" class="card question" aria-labelledby="question-title">
        <h1 id="question-title" ref="heading" tabindex="-1" class="question-title">{{ current.title }}</h1>
        <p class="question-help">{{ current.help }}</p>

        <div class="answer">
          <ChoiceChips
            v-if="current.key === 'makes'"
            v-model="answers.makes"
            :options="CREATION_TYPES"
            aria-labelledby="question-title"
          />
          <template v-else-if="current.key === 'themes'">
            <ChoiceChips
              v-model="answers.themes"
              :options="THEME_OPTIONS"
              :disabled-values="fullThemes"
              aria-labelledby="question-title"
            />
            <p class="hint" aria-live="polite">{{ answers.themes.length }} of {{ THEMES_MAX }} picked</p>
          </template>
          <ChoiceChips
            v-else-if="current.key === 'wants'"
            v-model="answers.wants"
            :options="CREATION_TYPES"
            aria-labelledby="question-title"
          />
          <ChoiceChips
            v-else-if="current.key === 'activity'"
            v-model="answers.activity"
            :options="ACTIVITY_OPTIONS"
            :multiple="false"
            aria-labelledby="question-title"
          />
          <CardColorPicker
            v-else-if="current.key === 'cardColor'"
            v-model="answers.cardColor"
            large
            aria-labelledby="question-title"
          />
        </div>

        <div class="nav">
          <button v-if="step > 0" type="button" class="btn btn-ghost" @click="back">
            <ArrowLeft :size="18" aria-hidden="true" /> Back
          </button>
          <span class="spacer" />
          <button v-if="answers[current.key].length == 0" type="button" class="btn btn-ghost" @click="next">Skip</button>
          <button v-else type="button" class="btn btn-primary" @click="next">
            {{ step === QUIZ_STEPS - 1 ? 'See my card' : 'Next' }}
            <ArrowRight :size="18" aria-hidden="true" />
          </button>
        </div>
      </section>

      <!-- Result -->
      <section v-else class="card question result" aria-labelledby="result-title">
        <h1 id="result-title" ref="heading" tabindex="-1" class="question-title">Here's your artist card</h1>
        <p class="question-help">
          This is how you'll look on Discover and on your profile. Find people who love the same things next.
        </p>

        <div v-if="savedToProfile" class="alert alert-success saved-note" role="status">
          <Check :size="18" aria-hidden="true" /> Saved to your profile.
          <RouterLink v-if="auth.user?.username" :to="`/users/${auth.user.username}`">See your profile</RouterLink>
        </div>

        <template v-else-if="auth.user">
          <label class="check">
            <input v-model="copyDefaults" type="checkbox" />
            Also fill in my sign-up forms with what I make and would like to receive
          </label>
          <div class="actions">
            <button type="button" class="btn btn-primary" :disabled="saving" @click="requestSave">
              <Loader2 v-if="saving" :size="18" class="spin" aria-hidden="true" />
              <Save v-else :size="18" aria-hidden="true" />
              Save to my profile
            </button>
          </div>
        </template>

        <div v-else class="actions">
          <RouterLink :to="{ path: '/register', query: { redirect: comeBack } }" class="btn btn-primary" @click="markPending">
            <Save :size="18" aria-hidden="true" /> Sign up to save
          </RouterLink>
          <RouterLink :to="{ path: '/login', query: { redirect: comeBack } }" class="btn btn-outline" @click="markPending">
            I have an account
          </RouterLink>
        </div>

        <div class="next-steps">
          <RouterLink to="/discover" class="btn btn-outline">
            <UsersRound :size="18" aria-hidden="true" /> Explore Discover
          </RouterLink>
          <button type="button" class="btn btn-ghost" @click="back"><ArrowLeft :size="18" aria-hidden="true" /> Change answers</button>
          <button type="button" class="btn btn-ghost" @click="restart"><RotateCcw :size="16" aria-hidden="true" /> Start over</button>
        </div>
      </section>

      <!-- Live card -->
      <aside class="preview" aria-label="Your artist card so far">
        <ArtistCard :card="previewCard" no-follow all-tags heading-tag="h2" class="preview-card" />
      </aside>
    </div>

    <section v-if="onResult && suggestions?.hasTaste" class="suggestions" aria-labelledby="like-you">
      <h2 id="like-you" class="section-title">Artists like you</h2>
      <ul v-if="suggestions.artists.length" class="suggest-grid">
        <li v-for="card in suggestions.artists" :key="card.user.id">
          <ArtistCard :card="card" :reasons="card.reasons" class="h-full" @follow-changed="onFollowChanged" />
        </li>
      </ul>
      <p v-else class="hint">Nobody shares these yet. Have a look around Discover instead.</p>

      <h2 class="section-title events-title">Events that fit you</h2>
      <ul v-if="suggestions.events.length" class="suggest-grid">
        <li v-for="item in suggestions.events" :key="item.event.id">
          <EventCard :event="item.event" class="h-full">
            <ul class="reasons" aria-label="Why it fits">
              <li v-for="r in item.reasons" :key="r">{{ r }}</li>
            </ul>
          </EventCard>
        </li>
      </ul>
      <p v-else class="hint">
        No open exchange fits these answers right now.
        <RouterLink to="/events">Browse every event</RouterLink>.
      </p>
    </section>
    <p v-else-if="onResult && suggestionsError" class="alert alert-error">{{ suggestionsError }}</p>

    <ConfirmDialog
      :open="confirmOpen"
      title="Replace your artist tags?"
      message="Your profile already has artist tags. Saving these answers will replace them."
      confirm-label="Replace them"
      @confirm="save"
      @cancel="confirmOpen = false"
    />
  </main>
</template>

<style scoped>
.quiz-page {
  max-width: 1040px;
}
.quiz-head {
  margin-bottom: 18px;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.82rem;
  color: var(--pink-dark);
}
.progress-text {
  margin: 6px 0 8px;
  color: var(--muted);
  font-weight: 600;
}
.progress {
  height: 6px;
}
.quiz-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
  gap: 24px;
  align-items: start;
}
.question {
  padding: 28px;
}
.question-title {
  margin: 0;
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 800;
  outline: none;
}
.question-help {
  margin: 8px 0 22px;
  color: var(--muted);
}
.answer {
  min-height: 120px;
}
.answer .hint {
  margin-top: 10px;
}
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 26px;
}
.spacer {
  flex: 1;
}
.preview {
  position: sticky;
  top: 90px;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0 0 16px;
  line-height: 1.5;
}
.actions,
.next-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.next-steps {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.saved-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.suggestions {
  margin-top: 36px;
}
.events-title {
  margin-top: 32px;
}
.suggest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  position: relative;
  z-index: 1;
}
.reasons li {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--pink-soft);
  color: var(--pink-dark);
}
@media (max-width: 760px) {
  .quiz-layout {
    grid-template-columns: 1fr;
  }
  /* The card sits above the question on phones, so each answer visibly changes it */
  .preview {
    position: static;
    order: -1;
  }
  .question {
    padding: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .progress span {
    transition: none;
  }
}
</style>
