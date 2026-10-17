<script setup>
import { RouterLink } from 'vue-router';
// The popsicle logo (client/public), wherever the site is hosted
const logoUrl = `${import.meta.env.BASE_URL}drawsicle.svg`;

const year = new Date().getFullYear();

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { to: '/events', label: 'Browse events' },
      { to: '/museum', label: 'The museum' },
      { to: '/events/new', label: 'Create an event' },
    ],
  },
  {
    title: 'You',
    links: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/characters', label: 'Character library' },
      { to: '/notification', label: 'Notifications' },
    ],
  },
  {
    title: 'Help',
    links: [
      { to: '/help', label: 'Help & FAQ' },
      { to: '/guidelines', label: 'Community guidelines' },
      { to: '/about', label: 'About' },
    ],
  },
];
</script>

<template>
  <footer class="site-footer">
    <div class="inner">
      <div class="brand-col">
        <RouterLink to="/" class="brand" aria-label="Drawsicle home">
          <img :src="logoUrl" alt="" class="brand-logo" width="36" height="36" />
          <span class="brand-name">Drawsicle</span>
        </RouterLink>
        <p class="tagline">Art exchanges for online art communities, without the spreadsheets.</p>
      </div>

      <nav class="links" aria-label="Footer">
        <div v-for="col in COLUMNS" :key="col.title" class="col">
          <h2 class="col-title">{{ col.title }}</h2>
          <ul>
            <li v-for="link in col.links" :key="link.to">
              <RouterLink :to="link.to">{{ link.label }}</RouterLink>
            </li>
          </ul>
        </div>
      </nav>
    </div>

    <div class="bottom">
      <div class="bottom-inner">
        <p>© {{ year }} Drawsicle · An IS216 project at SMU</p>
        <ul class="legal" aria-label="Legal">
          <li><RouterLink to="/privacy">Privacy</RouterLink></li>
          <li><RouterLink to="/terms">Terms</RouterLink></li>
        </ul>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  /* Above the museum's full-screen doodles, which shouldn't show through here */
  position: relative;
  z-index: 2;
  margin-top: 40px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 28px;
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(0, 2.4fr);
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
.brand-logo {
  width: 36px;
  height: 36px;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px 32px;
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
.bottom-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
}
.bottom p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}
.legal {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 18px;
  font-size: 0.88rem;
}
.legal a {
  color: var(--muted);
  font-weight: 600;
}
.legal a:hover {
  color: var(--pink-dark);
}

@media (max-width: 860px) {
  .inner {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .inner {
    padding: 32px 16px 24px;
  }
  .links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bottom-inner {
    padding: 14px 16px 18px;
  }
}
</style>
