<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Sparkles,
  ArrowRight,
  CalendarPlus,
  Share2,
  Shuffle,
  CalendarClock,
  BookHeart,
  UserRoundPlus,
  Gift,
  Upload,
  PartyPopper,
  WandSparkles,
  BellRing,
  LockKeyhole,
  LayoutDashboard,
  ImageUp,
  Check,
  Clock,
  Compass,
  CalendarHeart,
  RotateCcw,
  CircleHelp,
} from 'lucide-vue-next';
import EventCard from '@/components/events/EventCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { auth } from '@/stores/auth';
import { api, qs } from '@/api';

const ORGANISER_STEPS = [
  { icon: CalendarPlus, title: 'Create the event', text: 'Set the theme, rules, deadlines and how many artists can join.' },
  { icon: Share2, title: 'Share the link', text: 'Post one link in your Discord or group chat. Private events use an invite link.' },
  {
    icon: Shuffle,
    title: 'Match in one click',
    text: 'When sign-ups close, generate matches that respect what everyone can draw. Swap pairs before you publish.',
  },
  {
    icon: CalendarClock,
    title: 'Track deadlines',
    text: 'See who has submitted, send reminders and check gifts before the big reveal.',
  },
];

const ARTIST_STEPS = [
  { icon: BookHeart, title: 'Save your characters once', text: 'References, species and notes for artists live in your private library.' },
  { icon: UserRoundPlus, title: 'Sign up', text: 'Pick an event, choose characters to offer and say what you can make.' },
  { icon: Gift, title: 'Get your match', text: "See who you're making a gift for, with their characters and wishes." },
  { icon: Upload, title: 'Submit your gift', text: 'Upload your art, writing or music before the deadline. Reminders help.' },
  { icon: PartyPopper, title: 'Enjoy the reveal', text: 'When the event wraps up, find out who made your gift.' },
];

const FEATURES = [
  {
    icon: WandSparkles,
    title: 'Matching that respects what you can draw',
    text: "Nobody gets a character with a species or tag they've said they can't draw, and everyone gives and receives once.",
    link: { to: '/help#matching', label: 'How matching works' },
  },
  {
    icon: BookHeart,
    title: 'Reusable character library',
    text: 'Stop re-pasting reference links every event. Add a character once and offer it anywhere.',
  },
  {
    icon: BellRing,
    title: 'Deadline reminders',
    text: 'Participants get a nudge before submissions are due; organisers hear when sign-ups are about to close.',
  },
  {
    icon: LockKeyhole,
    title: 'Invite-only events',
    text: 'Keep an exchange to your own server. Private events never show up in the public listing.',
  },
  {
    icon: LayoutDashboard,
    title: 'Organiser dashboard',
    text: 'Applications, matches and submissions in one place, with counts that show who still owes a gift.',
  },
  {
    icon: ImageUp,
    title: 'Image uploads',
    text: 'Participants upload finished pieces straight to the event, ready for the reveal.',
  },
];

// Preview of events taking sign-ups
const openEvents = ref([]);
const eventsState = ref('loading'); // 'loading' | 'ready' | 'error'

async function loadOpenEvents() {
  eventsState.value = 'loading';
  try {
    const data = await api(`/events${qs({ status: 'open', limit: 3 })}`);
    openEvents.value = (data.events || []).slice(0, 3);
    eventsState.value = 'ready';
  } catch {
    eventsState.value = 'error';
  }
}
onMounted(loadOpenEvents);
</script>

<template>
  <main id="main" class="home">
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-text">
          <p class="eyebrow">
            <Sparkles :size="16" aria-hidden="true" />
            Secret Santas, Valentine swaps, seasonal exchanges
          </p>
          <h1 class="hero-title">Art exchanges, <span class="accent">minus the spreadsheets</span></h1>
          <p class="lead">
            Drawisicle collects sign-ups and character references, matches artists with characters they can actually
            draw, and keeps everyone on track until the reveal.
          </p>
          <div class="hero-cta">
            <template v-if="auth.user">
              <RouterLink to="/dashboard" class="btn btn-primary">
                <LayoutDashboard :size="18" aria-hidden="true" /> Go to your dashboard
              </RouterLink>
              <RouterLink to="/events/new" class="btn btn-outline">
                <CalendarPlus :size="18" aria-hidden="true" /> Create an event
              </RouterLink>
            </template>
            <template v-else>
              <RouterLink to="/register" class="btn btn-primary">
                Sign up free
                <ArrowRight :size="18" aria-hidden="true" />
              </RouterLink>
              <RouterLink to="/events" class="btn btn-outline">
                <Compass :size="18" aria-hidden="true" /> Browse events
              </RouterLink>
            </template>
          </div>
          <p v-if="!auth.user" class="hero-note">
            Already have an account? <RouterLink to="/login">Log in</RouterLink>
          </p>
          <p v-else class="hero-note">
            Welcome back, {{ auth.user.displayName }}. <RouterLink to="/events">Browse events</RouterLink> to find
            one to join.
          </p>
        </div>

        <!-- Illustration built from plain markup, so it stays crisp and needs no image files -->
        <div class="hero-art" aria-hidden="true">
          <div class="art-card art-back">
            <p class="art-label">Sign-ups (example)</p>
            <ul class="art-list">
              <li><span class="dot" style="background: var(--pink-soft); color: var(--pink-dark)">M</span> Mika <Check :size="14" /></li>
              <li><span class="dot" style="background: var(--info-soft); color: var(--info)">J</span> Juno <Check :size="14" /></li>
              <li><span class="dot" style="background: var(--success-soft); color: var(--success)">R</span> Rowan <Check :size="14" /></li>
              <li><span class="dot" style="background: var(--warning-soft); color: var(--warning)">S</span> Sol <Check :size="14" /></li>
            </ul>
          </div>

          <div class="art-card art-front">
            <div class="art-head">
              <span class="art-gift"><Gift :size="20" /></span>
              <div>
                <p class="art-label">Your match</p>
                <p class="art-title">You're making a gift for Juno</p>
              </div>
            </div>
            <div class="art-character">
              <span class="art-tile">P</span>
              <div>
                <p class="art-name">Pip</p>
                <p class="art-species">moth</p>
              </div>
            </div>
            <div class="art-tags">
              <span>fluffy</span><span>pastel</span><span>wings</span>
            </div>
            <div class="art-foot">
              <span class="art-deadline"><Clock :size="13" /> Reminder before it is due</span>
              <span class="art-ok"><Check :size="13" /> You can draw this</span>
            </div>
          </div>

          <div class="art-pill">
            <Shuffle :size="15" /> Matched in one click
          </div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="how-heading">
      <header class="section-head">
        <h2 id="how-heading" class="section-heading">How it works</h2>
        <p class="section-lead">One place for the organiser running it and the artists taking part.</p>
      </header>

      <div class="how-grid">
        <article class="card how-card">
          <span class="how-pill">For organisers</span>
          <h3 class="how-title">Run the whole exchange from one page</h3>
          <ol class="steps">
            <li v-for="(step, i) in ORGANISER_STEPS" :key="step.title" class="step">
              <span class="step-icon" aria-hidden="true">
                <component :is="step.icon" :size="20" />
                <span class="step-num">{{ i + 1 }}</span>
              </span>
              <div>
                <p class="step-title">{{ step.title }}</p>
                <p class="step-text">{{ step.text }}</p>
              </div>
            </li>
          </ol>
        </article>

        <article class="card how-card">
          <span class="how-pill artist">For artists</span>
          <h3 class="how-title">Sign up in minutes, get a match you can draw</h3>
          <ol class="steps">
            <li v-for="(step, i) in ARTIST_STEPS" :key="step.title" class="step">
              <span class="step-icon artist" aria-hidden="true">
                <component :is="step.icon" :size="20" />
                <span class="step-num">{{ i + 1 }}</span>
              </span>
              <div>
                <p class="step-title">{{ step.title }}</p>
                <p class="step-text">{{ step.text }}</p>
              </div>
            </li>
          </ol>
        </article>
      </div>
    </section>

    <section class="section" aria-labelledby="features-heading">
      <header class="section-head">
        <h2 id="features-heading" class="section-heading">Everything an exchange needs</h2>
        <p class="section-lead">Made for hobby art communities that are tired of juggling forms, sheets and DMs.</p>
      </header>

      <ul class="feature-grid">
        <li v-for="f in FEATURES" :key="f.title" class="card feature">
          <span class="feature-icon" aria-hidden="true"><component :is="f.icon" :size="22" /></span>
          <h3 class="feature-title">{{ f.title }}</h3>
          <p class="feature-text">{{ f.text }}</p>
          <RouterLink v-if="f.link" :to="f.link.to" class="feature-link">
            {{ f.link.label }} <ArrowRight :size="14" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </section>

    <section class="section" aria-labelledby="open-heading">
      <header class="section-head row">
        <div>
          <h2 id="open-heading" class="section-heading">Open for sign-ups</h2>
          <p class="section-lead">Exchanges taking artists right now.</p>
        </div>
        <RouterLink
          v-if="eventsState === 'ready' && openEvents.length"
          :to="{ path: '/events', query: { status: 'open' } }"
          class="see-all"
        >
          See all open events <ArrowRight :size="16" aria-hidden="true" />
        </RouterLink>
      </header>

      <div v-if="eventsState === 'loading'" role="status">
        <span class="sr-only">Loading open events…</span>
        <ul class="event-grid" aria-hidden="true">
          <li v-for="n in 3" :key="n" class="card skeleton">
            <span class="skeleton-banner" />
            <span class="skeleton-line short" />
            <span class="skeleton-line" />
            <span class="skeleton-line" />
          </li>
        </ul>
      </div>

      <div v-else-if="eventsState === 'error'" class="events-note" role="alert">
        <p>We couldn't load the latest events just now.</p>
        <div class="events-note-actions">
          <button type="button" class="btn btn-outline btn-sm" @click="loadOpenEvents">
            <RotateCcw :size="16" aria-hidden="true" /> Try again
          </button>
          <RouterLink to="/events" class="btn btn-ghost btn-sm">Browse events</RouterLink>
        </div>
      </div>

      <EmptyState
        v-else-if="!openEvents.length"
        :icon="CalendarHeart"
        title="Nothing is taking sign-ups right now"
        message="New exchanges open all the time. See what's running at the moment, or start one for your community."
      >
        <RouterLink to="/events" class="btn btn-outline btn-sm">
          <Compass :size="16" aria-hidden="true" /> Browse events
        </RouterLink>
        <RouterLink to="/events/new" class="btn btn-primary btn-sm">
          <CalendarPlus :size="16" aria-hidden="true" /> Create an event
        </RouterLink>
      </EmptyState>

      <ul v-else class="event-grid">
        <li v-for="event in openEvents" :key="event.id">
          <EventCard :event="event" class="h-full" />
        </li>
      </ul>
    </section>

    <section class="cta-band" aria-labelledby="cta-heading">
      <div class="cta-inner">
        <h2 id="cta-heading" class="cta-title">Ready for your next exchange?</h2>
        <p class="cta-text">
          {{
            auth.user
              ? 'Set up an event in a few minutes, or find one to join.'
              : 'Make an account, add your characters and join an event in a few minutes.'
          }}
        </p>
        <div class="cta-actions">
          <RouterLink :to="auth.user ? '/events/new' : '/register'" class="btn cta-primary">
            {{ auth.user ? 'Create an event' : 'Sign up free' }}
          </RouterLink>
          <RouterLink :to="auth.user ? '/dashboard' : '/events'" class="btn cta-secondary">
            {{ auth.user ? 'Go to your dashboard' : 'Browse events' }}
          </RouterLink>
        </div>
        <p class="cta-note">
          <CircleHelp :size="16" aria-hidden="true" /> Questions? <RouterLink to="/help">Read the help &amp; FAQ</RouterLink>
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home {
  overflow-x: clip;
}

/* ---------- Hero ---------- */
.hero {
  position: relative;
  background:
    radial-gradient(circle at 12% 18%, rgba(236, 106, 147, 0.14), transparent 42%),
    radial-gradient(circle at 88% 70%, rgba(99, 179, 245, 0.12), transparent 40%);
}
.hero-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 72px 24px 80px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  align-items: center;
  gap: 48px;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--pink-dark);
  font-weight: 600;
  font-size: 0.9rem;
}
.hero-title {
  margin-top: 20px;
  font-size: clamp(2.4rem, 5.6vw, 3.9rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.accent {
  color: var(--pink);
}
.lead {
  margin: 20px 0 0;
  max-width: 54ch;
  font-size: 1.15rem;
  line-height: 1.6;
  color: var(--text-soft);
}
.hero-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}
.hero-note {
  margin: 18px 0 0;
  color: var(--muted);
}

/* Illustration */
.hero-art {
  position: relative;
  min-height: 400px;
}
.art-card {
  position: absolute;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 40px rgba(90, 65, 30, 0.12);
  padding: 20px;
}
.art-back {
  top: 0;
  left: 4%;
  width: 230px;
  transform: rotate(-5deg);
}
.art-front {
  top: 70px;
  right: 2%;
  width: min(330px, 88%);
  transform: rotate(2deg);
}
.art-label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.art-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.art-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}
.art-list li :deep(svg) {
  margin-left: auto;
  color: var(--success);
}
.dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  font-weight: 700;
}
.art-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.art-gift {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pink);
  color: #fff;
  flex-shrink: 0;
}
.art-title {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  line-height: 1.2;
}
.art-character {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 12px;
  border-radius: 16px;
  background: var(--surface-2);
}
.art-tile {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--purple-soft);
  color: var(--purple-ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.2rem;
}
.art-name {
  margin: 0;
  font-weight: 700;
}
.art-species {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}
.art-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.art-tags span {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}
.art-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.art-deadline,
.art-ok {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.art-deadline {
  background: var(--warning-soft);
  color: var(--warning);
}
.art-ok {
  background: var(--success-soft);
  color: var(--success);
}
.art-pill {
  position: absolute;
  left: 0;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: 0 10px 24px rgba(47, 45, 43, 0.25);
}

/* ---------- Sections ---------- */
.section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 56px 24px;
}
.section-head {
  margin-bottom: 28px;
}
.section-head.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
}
.section-heading {
  font-size: clamp(1.8rem, 3.6vw, 2.4rem);
  font-weight: 800;
}
.section-lead {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 1.08rem;
  max-width: 60ch;
}
.see-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

/* How it works */
.how-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
.how-card {
  padding: 30px;
}
.how-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.82rem;
  font-weight: 700;
}
.how-pill.artist {
  background: var(--info-soft);
  color: var(--info);
}
.how-title {
  margin-top: 14px;
  font-size: 1.45rem;
  font-weight: 700;
}
.steps {
  list-style: none;
  margin: 22px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.step {
  display: flex;
  gap: 14px;
}
.step-icon {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.step-icon.artist {
  background: var(--info-soft);
  color: var(--info);
}
.step-num {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.7rem;
  font-weight: 700;
}
.step-title {
  margin: 0;
  font-weight: 700;
}
.step-text {
  margin: 2px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

/* Features */
.feature-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.feature {
  padding: 24px;
}
.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: var(--pink);
  color: #fff;
  box-shadow: 0 4px 12px rgba(236, 106, 147, 0.25);
}
.feature-title {
  margin-top: 16px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}
.feature-text {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.55;
}
.feature-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-weight: 700;
  font-size: 0.93rem;
}

/* Open events */
.event-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 0 22px;
  overflow: hidden;
}
.skeleton-banner,
.skeleton-line {
  display: block;
  background: linear-gradient(90deg, var(--chip) 0%, var(--hover) 50%, var(--chip) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-banner {
  height: 150px;
  margin-bottom: 8px;
}
.skeleton-line {
  height: 14px;
  margin: 0 22px;
  border-radius: 999px;
}
.skeleton-line.short {
  width: 40%;
  height: 22px;
}
@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
.events-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 18px 22px;
  border-radius: var(--radius-lg);
  border: 1.5px dashed var(--border);
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}
.events-note p {
  margin: 0;
  color: var(--muted);
  font-weight: 500;
}
.events-note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-banner,
  .skeleton-line {
    animation: none;
  }
}

/* Final call to action */
.cta-band {
  padding: 24px 24px 72px;
}
.cta-inner {
  max-width: 1152px;
  margin: 0 auto;
  padding: 52px 32px;
  border-radius: 28px;
  text-align: center;
  color: #fff;
  background:
    radial-gradient(circle at 15% 20%, rgba(255, 255, 255, 0.18), transparent 40%),
    linear-gradient(135deg, var(--pink) 0%, var(--pink-dark) 100%);
  box-shadow: 0 16px 40px rgba(217, 82, 125, 0.28);
}
.cta-title {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  font-weight: 800;
}
.cta-text {
  margin: 10px auto 0;
  max-width: 50ch;
  font-size: 1.1rem;
  opacity: 0.95;
}
.cta-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 26px;
}
.cta-primary {
  background: var(--surface);
  color: var(--pink-dark);
}
.cta-primary:hover {
  background: var(--pink-tint);
  color: var(--pink-dark);
}
.cta-secondary {
  background: transparent;
  color: #fff;
  border-color: rgba(255, 255, 255, 0.7);
}
.cta-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.cta-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 22px 0 0;
  font-size: 0.95rem;
  opacity: 0.95;
}
.cta-note a {
  color: #fff;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.cta-note a:focus-visible {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
}
.cta-band .btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
}

/* ---------- Smaller screens ---------- */
@media (max-width: 960px) {
  .hero-inner {
    grid-template-columns: minmax(0, 1fr);
    padding: 48px 24px 56px;
    gap: 36px;
  }
  .hero-art {
    max-width: 460px;
    width: 100%;
    margin: 0 auto;
  }
  .feature-grid,
  .event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .how-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .hero-inner {
    padding: 36px 16px 44px;
  }
  .lead {
    font-size: 1.05rem;
  }
  .hero-cta .btn {
    flex: 1 1 100%;
  }
  .hero-art {
    min-height: 390px;
  }
  .art-back {
    width: 190px;
    left: 0;
  }
  .art-front {
    top: 60px;
    right: 0;
  }
  .section {
    padding: 40px 16px;
  }
  .how-card {
    padding: 22px 18px;
  }
  .feature-grid,
  .event-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .cta-band {
    padding: 16px 16px 48px;
  }
  .cta-inner {
    padding: 40px 20px;
    border-radius: 22px;
  }
  .cta-actions .btn {
    flex: 1 1 100%;
  }
}
</style>
