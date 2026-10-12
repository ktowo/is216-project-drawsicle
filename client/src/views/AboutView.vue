<script setup>
import { RouterLink } from 'vue-router';
import { Info, Compass, CalendarPlus, UserPlus, LayoutDashboard, CircleHelp } from 'lucide-vue-next';
import InfoLayout from '@/components/info/InfoLayout.vue';
import { auth } from '@/stores/auth';
</script>

<template>
  <InfoLayout
    title="About Drawisicle"
    intro="A home for art exchanges: Secret Santas, Valentine swaps and seasonal trades for online art communities."
    :icon="Info"
    updated="12 October 2026"
    current="about"
  >
    <section id="what">
      <h2>What it is</h2>
      <p>
        Drawisicle runs art exchange events from start to finish. Organisers set up an event and share one link. Artists
        sign up, say what they can draw and which characters they would like to receive art of. When sign-ups close, the
        site pairs everyone up, keeps track of deadlines and collects the finished gifts for the reveal.
      </p>
    </section>

    <section id="why">
      <h2>Why we made it</h2>
      <p>
        Most exchanges today run on a mix of a Google Form, a spreadsheet and a lot of Discord messages. That works until
        it doesn't:
      </p>
      <ul>
        <li>Matching by hand takes hours and is easy to get wrong.</li>
        <li>Someone ends up with a character the artist said they can't draw.</li>
        <li>Organisers chase people for sign-ups and submissions across several tools.</li>
        <li>Everyone pastes the same character references into a new form every event.</li>
      </ul>
      <p>
        Drawisicle puts all of that in one place. Characters are saved once in a private library, matching respects what
        each artist can and can't draw, and reminders go out before deadlines.
      </p>
    </section>

    <section id="who">
      <h2>Who it's for</h2>
      <h3>Organisers</h3>
      <p>
        Anyone running an exchange for a server, a fandom or a group of friends. You decide the theme, rules, dates and
        how many artists can join, and you stay in charge of who is accepted and when matches go out.
      </p>
      <h3>Artists</h3>
      <p>
        Hobby artists and writers who give and receive gifts. You keep your own characters, choose what you
        offer for each event and see exactly who you are making something for.
      </p>
      <p>You can be both: plenty of people organise one event and join another.</p>
    </section>

    <section id="journeys">
      <h2>How an exchange runs</h2>
      <h3>As an organiser</h3>
      <ol>
        <li>Create the event with its rules and deadlines, then open it for sign-ups.</li>
        <li>Share the link in your community. Private events use an invite link.</li>
        <li>When sign-ups close, generate matches, swap pairs if you want to, and publish.</li>
        <li>Check submissions, send reminders and complete the event to reveal the gifts.</li>
      </ol>
      <h3>As an artist</h3>
      <ol>
        <li>Add your characters to your library once.</li>
        <li>Sign up to an event and choose what you can make and which characters you offer.</li>
        <li>Find out who you are making a gift for and submit it before the deadline.</li>
        <li>After the event completes, see who made yours.</li>
      </ol>
      <p>
        The <RouterLink to="/help#matching">help page</RouterLink> explains in plain words how matching decides who gets
        whom.
      </p>
    </section>

    <section id="project">
      <h2>Who built it</h2>
      <p>
        Drawisicle is a student project for the IS216 module at Singapore Management University (SMU).
        It is built with Vue, Express and MongoDB by a small team, and it is a learning project rather than a
        commercial service. That is also why the <RouterLink to="/terms">terms</RouterLink> are short and the
        <RouterLink to="/privacy">privacy page</RouterLink> says exactly what is stored.
      </p>
      <p>
        Found something broken, or have an idea? Tell the team through whoever shared the link with you, or check the
        <RouterLink to="/help#troubleshooting">troubleshooting tips</RouterLink> first.
      </p>
    </section>

    <template #after>
      <div class="card cta">
        <h2 class="cta-title">{{ auth.user ? 'Ready for your next exchange?' : 'Want to try it?' }}</h2>
        <p class="cta-text">
          {{
            auth.user
              ? 'Jump back into your dashboard, find an event to join, or start one of your own.'
              : 'Browse what is running right now, or make an account to join or host an exchange.'
          }}
        </p>
        <div class="cta-actions">
          <template v-if="auth.user">
            <RouterLink to="/dashboard" class="btn btn-primary btn-sm">
              <LayoutDashboard :size="16" aria-hidden="true" /> Go to your dashboard
            </RouterLink>
            <RouterLink to="/events/new" class="btn btn-outline btn-sm">
              <CalendarPlus :size="16" aria-hidden="true" /> Create an event
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/register" class="btn btn-primary btn-sm">
              <UserPlus :size="16" aria-hidden="true" /> Create an account
            </RouterLink>
          </template>
          <RouterLink to="/events" class="btn btn-outline btn-sm">
            <Compass :size="16" aria-hidden="true" /> Browse events
          </RouterLink>
          <RouterLink to="/help" class="btn btn-ghost btn-sm">
            <CircleHelp :size="16" aria-hidden="true" /> Read the FAQ
          </RouterLink>
        </div>
      </div>
    </template>
  </InfoLayout>
</template>

<style scoped>
.cta {
  margin-top: 24px;
  padding: 26px 28px;
}
.cta-title {
  font-size: 1.4rem;
  font-weight: 800;
}
.cta-text {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.6;
}
.cta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
@media (max-width: 640px) {
  .cta {
    padding: 22px 18px;
  }
}
</style>
