<script setup>
// "Everything an exchange needs" as a bento grid. Each tile pairs a feature with a small
// illustration of the real screen instead of an icon. data-floating-stop marks where the floating
// "Happening now" card should disappear.
import { RouterLink } from 'vue-router';
import { Lock, Link2, Bell, Upload, Sparkles, ArrowRight, Check } from 'lucide-vue-next';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// A small month: which days are sign-up close (s), gift deadline (g) and reveal (r)
const MONTH = Array.from({ length: 28 }, (_, i) => i + 1);
const MARK = { 9: 's', 20: 'g', 27: 'r' };
</script>

<template>
  <section class="features" data-floating-stop aria-labelledby="features-heading">
    <header class="f-head">
      <h2 id="features-heading">Everything an exchange needs</h2>
      <p>Made for hobby art communities that are tired of juggling forms, sheets and DMs.</p>
    </header>

    <div class="bento">
      <!-- Matching -->
      <article class="tile t-match">
        <div class="art" aria-hidden="true">
          <div class="m-prompt"><b>Matching</b> · 6 artists · nobody gets a character they can't draw</div>
          <!-- Branches end at the middle of each of the four pill columns -->
          <svg viewBox="0 0 400 40" preserveAspectRatio="none" class="tree">
            <path d="M200 0 V16 M50 16 H350 M50 16 V40 M150 16 V40 M250 16 V40 M350 16 V40" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="pairs">
            <span class="pair ok"><Check :size="11" /> Mika → Sol</span>
            <span class="pair ok"><Check :size="11" /> Sol → Remy</span>
            <span class="pair ok"><Check :size="11" /> Remy → Noor</span>
            <span class="pair ok"><Check :size="11" /> Noor → Mika</span>
          </div>
        </div>
        <div class="copy">
          <h3>Matching that respects what you can draw</h3>
          <p>Nobody gets a character with a species or tag they've said they can't draw, and everyone gives and receives once.</p>
          <RouterLink to="/help#matching" class="more">How matching works <ArrowRight :size="14" aria-hidden="true" /></RouterLink>
        </div>
      </article>

      <!-- Reminders (tall) -->
      <article class="tile t-remind">
        <div class="art cal" aria-hidden="true">
          <div class="cal-grid">
            <span v-for="(d, i) in DAYS" :key="`h${i}`" class="dow">{{ d }}</span>
            <span v-for="n in MONTH" :key="n" class="day" :class="MARK[n]">{{ n }}</span>
          </div>
          <div class="toast"><Bell :size="14" /><div><b>Gift due in 2 days</b><small>Winter Secret Santa</small></div></div>
          <div class="legend"><span class="s">Sign-ups close</span><span class="g">Gifts due</span><span class="r">Reveal</span></div>
        </div>
        <div class="copy">
          <h3>Deadline reminders</h3>
          <p>Participants get a nudge before submissions are due; organisers hear when sign-ups are about to close.</p>
        </div>
      </article>

      <!-- Organiser dashboard -->
      <article class="tile t-dash">
        <div class="art" aria-hidden="true">
          <div v-for="[n, st, w] in [['Mika', 'Submitted', 100], ['Sol', 'Submitted', 100], ['Noor', 'In progress', 60], ['Kit', 'Not started', 15]]" :key="n" class="row">
            <span class="av">{{ n[0] }}</span><span class="nm">{{ n }}</span>
            <span class="track"><span :style="{ width: `${w}%` }" :class="{ low: w < 50 }" /></span>
            <span class="st" :class="{ low: w < 50 }">{{ st }}</span>
          </div>
        </div>
        <div class="copy">
          <h3>Organiser dashboard</h3>
          <p>Applications, matches and submissions in one place, with counts that show who still owes a gift.</p>
        </div>
      </article>

      <!-- Invite-only -->
      <article class="tile t-invite">
        <div class="art center" aria-hidden="true">
          <span class="lock"><Lock :size="26" /></span>
          <span class="invite"><Link2 :size="13" /> drawsicle.app/e/studio-club?invite=…</span>
        </div>
        <div class="copy">
          <h3>Invite-only events</h3>
          <p>Keep an exchange to your own server. Private events never show up in the public listing.</p>
        </div>
      </article>

      <!-- Character library -->
      <article class="tile t-chars">
        <div class="art chars" aria-hidden="true">
          <div class="char-card"><img src="/demo-art/spring-kit-mika.jpg" alt="" /><div><b>Biscuit</b><small>Dragon · pastel</small></div></div>
          <svg viewBox="0 0 60 90" class="links"><path d="M0 45 C30 45 30 12 60 12 M0 45 H60 M0 45 C30 45 30 78 60 78" /></svg>
          <div class="events">
            <span>Winter Secret Santa</span>
            <span>Spring Bloom</span>
            <span>Valentine Doodles</span>
          </div>
        </div>
        <div class="copy">
          <h3>Reusable character library</h3>
          <p>Stop re-pasting reference links every event. Add a character once and offer it anywhere.</p>
        </div>
      </article>

      <!-- Uploads -->
      <article class="tile t-upload">
        <div class="art upload" aria-hidden="true">
          <div class="drop"><Upload :size="18" /> Drop your finished piece</div>
          <div class="thumbs">
            <img src="/demo-art/spring-mika-sol.jpg" alt="" />
            <img src="/demo-art/spring-noor-kit.jpg" alt="" />
            <img src="/demo-art/gallery-pip-remy.jpg" alt="" />
          </div>
        </div>
        <div class="copy">
          <h3>Image uploads</h3>
          <p>Participants upload finished pieces straight to the event, ready for the reveal.</p>
        </div>
      </article>

      <!-- Quiz CTA -->
      <RouterLink to="/find-your-style" class="tile t-cta">
        <Sparkles :size="26" />
        <h3>Find your style</h3>
        <p>Five questions, then meet artists and exchanges that fit you.</p>
        <span class="go">Start <ArrowRight :size="16" /></span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.features { max-width: 1120px; margin: 0 auto; padding: 72px 16px 56px; }
.f-head { text-align: center; max-width: 640px; margin: 0 auto 32px; }
.f-head h2 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 800; letter-spacing: -0.02em; }
.more { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-weight: 700; }
.f-head p { margin: 10px 0 0; color: var(--muted); }
.bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; grid-template-areas: 'match match remind' 'dash dash remind' 'invite chars chars' 'upload upload cta'; }
.tile { min-width: 0; border-radius: 22px; background: var(--surface); border: 1px solid var(--border); padding: 22px; display: flex; gap: 28px; box-shadow: 0 10px 30px rgba(90, 65, 30, .05); color: var(--text); }
.t-match { grid-area: match; } .t-remind { grid-area: remind; flex-direction: column; } .t-dash { grid-area: dash; }
.t-invite { grid-area: invite; flex-direction: column; } .t-chars { grid-area: chars; } .t-upload { grid-area: upload; } .t-cta { grid-area: cta; }
.art { flex: 1.15; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: .78rem; }
.copy { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.copy h3 { margin: 0; font-size: 1.1rem; font-weight: 800; }
.copy p { margin: 6px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.55; }
.t-remind .copy, .t-invite .copy { justify-content: flex-end; }
/* Matching */
.m-prompt { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg, transparent); }
.tree { width: 100%; height: 28px; display: block; }
.tree path { fill: none; stroke: var(--border); stroke-width: 2; }
.pairs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.pair { min-width: 0; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 5px 4px; border-radius: 999px; font-weight: 700; font-size: .68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pair svg { flex-shrink: 0; }
.pair.ok { background: color-mix(in srgb, #a8e0c4 45%, transparent); color: #2f8f66; }
/* Calendar */
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center; }
.dow { color: var(--muted); font-weight: 700; font-size: .7rem; }
.day { padding: 5px 0; border-radius: 8px; font-size: .74rem; color: var(--muted); }
.day.s { background: color-mix(in srgb, #a9cff2 60%, transparent); color: #12324f; font-weight: 800; }
.day.g { background: var(--pink); color: #fff; font-weight: 800; }
.day.r { background: color-mix(in srgb, #f6df8f 70%, transparent); color: #433510; font-weight: 800; }
.toast { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 10px 24px rgba(90, 65, 30, .12); margin-top: 6px; color: var(--pink-dark); }
.toast b { display: block; color: var(--text); font-size: .82rem; }
.toast small { color: var(--muted); }
.legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: .68rem; color: var(--muted); }
.legend span::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 3px; margin-right: 4px; vertical-align: middle; }
.legend .s::before { background: #a9cff2; } .legend .g::before { background: var(--pink); } .legend .r::before { background: #f6df8f; }
/* Dashboard */
.row { display: grid; grid-template-columns: 22px 44px 1fr auto; align-items: center; gap: 8px; }
.av { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--pink-soft); color: var(--pink-dark); font-weight: 800; font-size: .68rem; }
.nm { font-weight: 700; }
.track { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; }
.track span { display: block; height: 100%; background: #2f9e6e; }
.track span.low, .st.low { background: #d18a1d; }
.st { font-size: .68rem; font-weight: 700; color: #2f9e6e; background: none; }
.st.low { background: none; color: #d18a1d; }
/* Invite */
.center { align-items: center; text-align: center; }
.lock { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: color-mix(in srgb, #c9b8f0 50%, transparent); color: #2c1f52; }
.invite { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 999px; border: 1px dashed var(--border); font-family: ui-monospace, monospace; font-size: .68rem; }
/* Characters */
.chars { flex-direction: row; align-items: center; gap: 0; }
.char-card { display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); }
.char-card img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
.char-card b { display: block; } .char-card small { color: var(--muted); }
.links { width: 50px; height: 80px; flex-shrink: 0; }
.links path { fill: none; stroke: var(--pink); stroke-width: 2; stroke-dasharray: 4 4; }
.events { display: flex; flex-direction: column; gap: 6px; }
.events span { padding: 5px 10px; border-radius: 999px; background: var(--pink-soft); color: var(--pink-dark); font-weight: 700; font-size: .72rem; white-space: nowrap; }
/* Upload */
.drop { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 14px; border-radius: 14px; border: 2px dashed var(--border); color: var(--muted); font-weight: 600; }
.thumbs { display: flex; gap: 6px; }
.thumbs img { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; }
/* CTA */
.t-cta { flex-direction: column; justify-content: center; gap: 4px; background: linear-gradient(140deg, var(--pink-soft), var(--surface)); color: var(--pink-dark); }
.t-cta h3 { margin: 6px 0 0; color: var(--text); font-weight: 800; }
.t-cta p { margin: 0; color: var(--muted); font-size: .9rem; }
.go { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-weight: 800; }
@media (max-width: 860px) {
  .bento { grid-template-columns: 1fr; grid-template-areas: 'match' 'remind' 'dash' 'invite' 'chars' 'upload' 'cta'; }
  .tile { flex-direction: column; }
}
</style>
