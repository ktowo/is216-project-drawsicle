<script setup>
import {
    Sparkles,
    ArrowRight,
    CalendarPlus,
    Shuffle,
    Gift,
    LayoutDashboard,
    Check,
    Clock,
    Compass,
} from 'lucide-vue-next';
</script>

<template>
    <section class="hero">
        <div class="hero-inner">
            <div class="hero-text">
                <p class="eyebrow">
                    <Sparkles :size="16" aria-hidden="true" />
                    Secret Santas, Valentine swaps, seasonal exchanges
                </p>
                <h1 class="hero-title">Art exchanges, <span class="accent">minus the spreadsheets</span></h1>
                <p class="lead">
                    Drawsicle collects sign-ups and character references, matches artists with characters they can
                    actually
                    draw, and keeps everyone on track until the reveal.
                </p>
                <div class="hero-cta">
                    <template v-if="isAuthenticated">
                        <RouterLink to="/dashboard" class="btn">
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
            </div>
        </div>

        <!-- Illustration built from plain markup, so it stays crisp and needs no image files -->
        <div class="hero-art" aria-hidden="true">
            <div class="art-card art-back">
                <p class="art-label">Sign-ups (example)</p>
                <ul class="art-list">
                    <li><span class="dot" style="background: var(--pink-soft); color: var(--pink-dark)">M</span>
                        Mika
                        <Check :size="14" />
                    </li>
                    <li><span class="dot" style="background: var(--info-soft); color: var(--info)">J</span> Juno
                        <Check :size="14" />
                    </li>
                    <li><span class="dot" style="background: var(--success-soft); color: var(--success)">R</span>
                        Rowan
                        <Check :size="14" />
                    </li>
                    <li><span class="dot" style="background: var(--warning-soft); color: var(--warning)">S</span>
                        Sol
                        <Check :size="14" />
                    </li>
                </ul>
            </div>

            <div class="art-card art-front">
                <div class="art-head">
                    <span class="art-gift">
                        <Gift :size="20" />
                    </span>
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
                    <span class="art-deadline">
                        <Clock :size="13" /> Reminder before it is due
                    </span>
                    <span class="art-ok">
                        <Check :size="13" /> You can draw this
                    </span>
                </div>
            </div>

            <div class="art-pill">
                <Shuffle :size="15" /> Matched in one click
            </div>
        </div>
    </section>
</template>

<style scoped>
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
    @apply absolute left-0 bottom-0 inline-flex items-center gap-2 rounded-full;

    padding: 10px 16px;
    background: var(--text);
    color: var(--bg);
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: 0 10px 24px rgba(47, 45, 43, 0.25);
}
</style>