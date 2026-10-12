<script setup>
import { RouterLink } from 'vue-router';
import { Palette } from 'lucide-vue-next';

const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="inner">
      <div class="brand-col">
        <RouterLink to="/" class="brand">
          <span class="brand-tile"><Palette :size="20" aria-hidden="true" /></span>
          <span class="brand-name">Drawisicle</span>
        </RouterLink>
        <p class="tagline">Art exchanges for online art communities, without the spreadsheets.</p>
      </div>

      <nav class="links" aria-label="Footer">
        <div class="col">
          <h2 class="col-title">Explore</h2>
          <ul>
            <li><RouterLink to="/events">Browse events</RouterLink></li>
            <li><RouterLink to="/events/new">Create an event</RouterLink></li>
          </ul>
        </div>
        <div class="col">
          <h2 class="col-title">You</h2>
          <ul>
            <li><RouterLink to="/dashboard">Dashboard</RouterLink></li>
            <li><RouterLink to="/characters">Character library</RouterLink></li>
            <li><RouterLink to="/notification">Notifications</RouterLink></li>
          </ul>
        </div>
      </nav>
    </div>

    <div class="bottom">
      <p>© {{ year }} Drawisicle · IS216 project</p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 40px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 28px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 32px 48px;
}
.brand-col {
  max-width: 340px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}
.brand:hover {
  color: var(--text);
}
.brand-tile {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pink);
  color: #fff;
  display: grid;
  place-items: center;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.25rem;
}
.tagline {
  margin: 12px 0 0;
  color: var(--muted);
  line-height: 1.6;
}
.links {
  display: flex;
  gap: 56px;
}
.col-title {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.col ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.col a {
  color: var(--text);
  font-weight: 500;
}
.col a:hover {
  color: var(--pink-dark);
}
.bottom {
  border-top: 1px solid var(--border);
}
.bottom p {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px 20px;
  color: var(--muted);
  font-size: 0.88rem;
}
@media (max-width: 640px) {
  .inner {
    padding: 32px 16px 24px;
  }
  .links {
    gap: 40px;
  }
  .bottom p {
    padding: 14px 16px 18px;
  }
}
</style>
