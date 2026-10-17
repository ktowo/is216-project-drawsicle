<script setup>
// "How it works" as one scroll-driven stepper with two tracks (organisers / artists). Each step
// pairs a short explanation with a small illustration of the real screen (demo names and demo art,
// hidden from screen readers); the progress bar fills and the current step comes into focus as you
// scroll. On phones every step is fully shown.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { Check, Copy, Clock, Upload, Gift, Sparkles, Users, Link2 } from 'lucide-vue-next';

const TRACKS = {
  organisers: {
    label: 'For organisers',
    title: 'Run the whole exchange from one page',
    cta: { to: '/events/new', text: 'Create an event' },
    steps: [
      { title: 'Create the event', text: 'Set the theme, rules, deadlines and how many artists can join.', mock: 'event' },
      { title: 'Share the link', text: 'Post one link in your Discord or group chat. Private events use an invite link.', mock: 'share' },
      { title: 'Match in one click', text: 'When sign-ups close, generate matches that respect what everyone can draw. Swap pairs before you publish.', mock: 'match' },
      { title: 'Track deadlines', text: 'See who has submitted, send reminders and check gifts before the big reveal.', mock: 'track' },
    ],
  },
  artists: {
    label: 'For artists',
    title: 'Sign up in minutes, get a match you can draw',
    cta: { to: '/find-your-style', text: 'Find your style' },
    steps: [
      { title: 'Save your characters once', text: 'References, species and notes for artists live in your private library.', mock: 'character' },
      { title: 'Sign up', text: 'Pick an event, choose characters to offer and say what you can make.', mock: 'signup' },
      { title: 'Get your match', text: "See who you're making a gift for, with their characters and wishes.", mock: 'yourmatch' },
      { title: 'Submit your gift', text: 'Upload your art or writing before the deadline. Reminders help.', mock: 'submit' },
      { title: 'Enjoy the reveal', text: 'When the event wraps up, find out who made your gift.', mock: 'reveal' },
    ],
  },
};

const track = ref('organisers');
const current = computed(() => TRACKS[track.value]);
const active = ref(0);
const progress = computed(() => ((active.value + 1) / current.value.steps.length) * 100);

const stepEls = ref([]);
let observer = null;
function observe() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = Number(e.target.dataset.index);
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  stepEls.value.forEach((el) => el && observer.observe(el));
}
onMounted(observe);
onBeforeUnmount(() => observer?.disconnect());
const keys = Object.keys(TRACKS);
// Tabs: left/right arrows move between the two tracks and focus the new tab
const tabEls = ref({});
function onTabKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const next = keys[(keys.indexOf(track.value) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
  track.value = next;
  tabEls.value[next]?.focus();
}
watch(track, async () => {
  active.value = 0;
  await nextTick();
  observe();
});
</script>

<template>
  <section class="how" aria-labelledby="how-heading">
    <header class="how-head">
      <div>
        <span class="pill">How it works</span>
        <h2 id="how-heading" class="how-title">One exchange, two sides,<br />a few simple steps.</h2>
      </div>
      <div class="how-side">
        <p>Organisers run everything from one page; artists sign up once and get a match they can actually draw.</p>
        <div class="toggle" role="tablist" aria-label="Who are you?" @keydown="onTabKey">
          <button
            v-for="(t, key) in TRACKS"
            :key="key"
            :ref="(el) => (tabEls[key] = el)"
            :id="`how-tab-${key}`"
            type="button"
            role="tab"
            aria-controls="how-panel"
            :tabindex="track === key ? 0 : -1"
            :aria-selected="track === key ? 'true' : 'false'"
            :class="{ on: track === key }"
            @click="track = key"
          >
            {{ t.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="bar" aria-hidden="true"><span :style="{ width: `${progress}%` }" /></div>

    <div id="how-panel" class="panel" role="tabpanel" :aria-labelledby="`how-tab-${track}`">
      <h3 class="sr-only">{{ current.title }}</h3>
      <ol class="steps">
        <li
          v-for="(step, i) in current.steps"
          :key="`${track}-${i}`"
          :ref="(el) => (stepEls[i] = el)"
          :data-index="i"
          class="step"
          :class="{ on: i === active }"
        >
          <div class="step-text">
            <span class="num">{{ String(i + 1).padStart(2, '0') }}</span>
            <h4>{{ step.title }}</h4>
            <p>{{ step.text }}</p>
          </div>

          <div class="mock" aria-hidden="true">
            <span class="m-tag">Illustration</span>
            <!-- Organisers -->
            <div v-if="step.mock === 'event'" class="m-card">
              <p class="m-label">Event name</p><div class="m-input">Winter Secret Santa 2026</div>
              <p class="m-label">Theme</p><div class="m-input">Cosy winter nights</div>
              <div class="m-row"><div class="m-chip on">Art</div><div class="m-chip on">Writing</div><div class="m-chip">Adoptable</div></div>
              <div class="m-row"><div class="m-input half"><Clock :size="13" /> Sign-ups close 25 Oct</div><div class="m-input half">Max 40 artists</div></div>
            </div>
            <div v-else-if="step.mock === 'share'" class="m-card">
              <p class="m-label">Share this link</p>
              <div class="m-input link"><Link2 :size="14" /> drawsicle.app/e/winter-santa <span class="m-btn small"><Copy :size="12" /> Copy</span></div>
              <div class="m-chat"><span class="m-avatar">M</span><div><b>Mika</b><p>Sign-ups for the Winter Secret Santa are open! 🎄 drawsicle.app/e/winter-santa</p></div></div>
            </div>
            <div v-else-if="step.mock === 'match'" class="m-card">
              <p class="m-head"><Sparkles :size="14" /> 5 matches made · everyone placed</p>
              <div v-for="[a, b, s] in [['Mika', 'Sol', 92], ['Sol', 'Remy', 88], ['Remy', 'Noor', 81]]" :key="a" class="m-pair">
                <span class="m-avatar">{{ a[0] }}</span>{{ a }} <span class="arrow">→</span> <span class="m-avatar">{{ b[0] }}</span>{{ b }}
                <span class="m-score"><span :style="{ width: `${s}%` }" /></span>
              </div>
              <div class="m-btn">Publish matches</div>
            </div>
            <div v-else-if="step.mock === 'track'" class="m-card">
              <p class="m-head"><Gift :size="14" /> Gifts · due in 5 days</p>
              <div class="m-progress"><span style="width: 60%" /></div>
              <p class="m-small">3 of 5 submitted</p>
              <div v-for="[n, st] in [['Mika', 'Submitted'], ['Sol', 'Submitted'], ['Noor', 'Not yet']]" :key="n" class="m-pair">
                <span class="m-avatar">{{ n[0] }}</span>{{ n }}<span class="m-status" :class="{ late: st === 'Not yet' }">{{ st }}</span>
              </div>
              <div class="m-btn ghost">Send a reminder</div>
            </div>

            <!-- Artists -->
            <div v-else-if="step.mock === 'character'" class="m-card">
              <div class="m-char"><img src="/demo-art/spring-kit-mika.jpg" alt="" /><div><b>Biscuit</b><p>Dragon · pastel, fantasy</p><p class="m-small">A sleepy cream dragon who hoards teacups.</p></div></div>
              <div class="m-row"><div class="m-chip on">Reference sheet</div><div class="m-chip on">Toyhou.se</div></div>
            </div>
            <div v-else-if="step.mock === 'signup'" class="m-card">
              <p class="m-head">Winter Secret Santa · Step 2 of 4</p>
              <p class="m-label">Characters to offer</p>
              <div class="m-row"><div class="m-chip on"><Check :size="12" /> Biscuit</div><div class="m-chip">Pocket</div></div>
              <p class="m-label">I can make</p>
              <div class="m-row"><div class="m-chip on">Art</div><div class="m-chip on">Writing</div></div>
              <div class="m-btn">Next</div>
            </div>
            <div v-else-if="step.mock === 'yourmatch'" class="m-card">
              <p class="m-head"><Gift :size="14" /> You're making a gift for</p>
              <div class="m-char"><img src="/demo-art/spring-mika-sol.jpg" alt="" /><div><b>Sol · Ember</b><p>Fox · fluffy, fantasy</p><p class="m-small">Likes: dynamic poses, sunsets</p></div></div>
              <div class="m-row"><div class="m-chip on"><Check :size="12" /> You can draw this</div></div>
            </div>
            <div v-else-if="step.mock === 'submit'" class="m-card">
              <p class="m-head"><Upload :size="14" /> Submit your gift · due in 5 days</p>
              <div class="m-drop"><img src="/demo-art/spring-noor-kit.jpg" alt="" /><span>lantern-tea-stall.png</span></div>
              <div class="m-input">A note for Kit…</div>
              <div class="m-btn">Submit gift</div>
            </div>
            <div v-else-if="step.mock === 'reveal'" class="m-card reveal">
              <img src="/demo-art/spring-sol-remy.jpg" alt="" />
              <p class="m-head"><Sparkles :size="14" /> Your gift is from Sol!</p>
              <p class="m-small">“Marzipan nap time” · Spring Bloom Exchange</p>
            </div>
          </div>
        </li>
      </ol>
      <div class="panel-cta">
        <RouterLink :to="current.cta.to" class="cta"><Users :size="18" /> {{ current.cta.text }}</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how { max-width: 1120px; margin: 0 auto; padding: 72px 16px 40px; }
.how-head { display: grid; grid-template-columns: 1.1fr 1fr; gap: 32px; align-items: end; }
.pill { display: inline-block; padding: 6px 14px; border-radius: 999px; background: var(--pink-soft); color: var(--pink-dark); font-weight: 700; font-size: .9rem; }
.how-title { margin: 16px 0 0; font-size: clamp(2rem, 4.5vw, 3.2rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
.how-side p { margin: 0 0 16px; color: var(--muted); font-size: 1.05rem; line-height: 1.6; }
.toggle { display: inline-flex; padding: 4px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); }
.toggle button { border: 0; background: none; padding: 9px 18px; border-radius: 999px; font-weight: 700; color: var(--muted); cursor: pointer; }
.toggle button.on { background: var(--pink); color: #fff; }
.bar { margin: 32px 0 28px; height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--pink); border-radius: inherit; transition: width .4s ease; }
.panel { border-radius: 28px; border: 1px solid color-mix(in srgb, var(--pink) 25%, var(--border)); background: radial-gradient(600px 300px at 15% 0%, color-mix(in srgb, var(--pink-soft) 70%, transparent), transparent 70%), var(--surface); padding: 12px 40px 36px; }
.steps { list-style: none; margin: 0; padding: 0; }
.step { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; min-height: 360px; padding: 36px 0; border-bottom: 1px dashed var(--border); opacity: .35; transition: opacity .35s; }
.step:last-child { border-bottom: 0; }
.step.on { opacity: 1; }
.num { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 50%; background: linear-gradient(145deg, var(--pink), var(--pink-dark)); color: #fff; font-weight: 800; font-size: 1.2rem; box-shadow: 0 10px 24px color-mix(in srgb, var(--pink) 40%, transparent); }
.step-text h4 { margin: 22px 0 0; font-size: clamp(1.5rem, 3vw, 2.1rem); font-weight: 800; letter-spacing: -0.02em; }
.step-text p { margin: 10px 0 0; color: var(--muted); font-size: 1.05rem; line-height: 1.6; max-width: 42ch; }
.mock { position: relative; display: flex; justify-content: center; }
.m-tag { position: absolute; top: -10px; right: 8%; z-index: 1; padding: 2px 8px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: .68rem; color: var(--muted); }
.m-card { width: min(340px, 100%); padding: 18px; border-radius: 22px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 20px 50px rgba(90, 65, 30, .12); display: flex; flex-direction: column; gap: 8px; font-size: .85rem; }
.m-label { margin: 4px 0 0; font-size: .72rem; color: var(--muted); font-weight: 700; }
.m-head { margin: 0 0 4px; display: flex; align-items: center; gap: 6px; font-weight: 800; }
.m-input { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg, transparent); }
.m-input.half { flex: 1; }
.m-input.link { font-family: ui-monospace, monospace; font-size: .78rem; }
.m-row { display: flex; gap: 6px; flex-wrap: wrap; }
.m-chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border); font-weight: 600; font-size: .78rem; }
.m-chip.on { background: var(--pink-soft); color: var(--pink-dark); border-color: transparent; }
.m-btn { align-self: flex-start; margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; padding: 9px 16px; border-radius: 12px; background: var(--pink); color: #fff; font-weight: 800; }
.m-btn.small { margin: 0 0 0 auto; padding: 4px 10px; font-size: .72rem; }
.m-btn.ghost { background: transparent; color: var(--pink-dark); border: 1px solid var(--pink); }
.m-avatar { width: 24px; height: 24px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--pink-soft); color: var(--pink-dark); font-weight: 800; font-size: .72rem; flex-shrink: 0; }
.m-chat { display: flex; gap: 10px; padding: 10px; border-radius: 14px; background: color-mix(in srgb, #6b6bd6 10%, transparent); }
.m-chat p { margin: 2px 0 0; font-size: .8rem; }
.m-pair { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.arrow { color: var(--pink); }
.m-score { margin-left: auto; width: 60px; height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; }
.m-score span, .m-progress span { display: block; height: 100%; background: #2f9e6e; }
.m-progress { height: 8px; border-radius: 999px; background: var(--border); overflow: hidden; }
.m-small { margin: 0; font-size: .76rem; color: var(--muted); }
.m-status { margin-left: auto; font-size: .72rem; font-weight: 700; color: #2f9e6e; }
.m-status.late { color: #d18a1d; }
.m-char { display: flex; gap: 12px; align-items: center; }
.m-char img { width: 72px; height: 72px; border-radius: 14px; object-fit: cover; }
.m-char p { margin: 2px 0 0; }
.m-drop { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 14px; border: 2px dashed var(--border); }
.m-drop img { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; }
.reveal img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 14px; }
.panel-cta { display: flex; justify-content: center; padding-top: 12px; }
.cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 24px; border-radius: 999px; background: var(--pink); color: #fff; font-weight: 800; }
@media (max-width: 800px) {
  .how-head { grid-template-columns: 1fr; }
  .panel { padding: 8px 18px 28px; }
  .step { grid-template-columns: 1fr; gap: 20px; min-height: 0; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .step, .bar span { transition: none; } }
</style>
