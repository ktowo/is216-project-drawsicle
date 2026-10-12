<script setup>
import { RouterLink } from 'vue-router';
import { Signpost, House, Compass } from 'lucide-vue-next';
import { auth } from '@/stores/auth';
</script>

<template>
  <main id="main" class="page status-page">
    <div class="card status-card">
      <p class="code" aria-hidden="true">404</p>
      <span class="icon-tile" aria-hidden="true"><Signpost :size="30" /></span>
      <h1 class="title">We couldn't find that page</h1>
      <p class="text">
        The link may be old or mistyped. If someone shared an event with you, it might be private: ask them for the
        invite link.
      </p>
      <div class="actions">
        <RouterLink :to="auth.user ? '/dashboard' : '/'" class="btn btn-primary">
          <House :size="18" aria-hidden="true" />
          {{ auth.user ? 'Go to your dashboard' : 'Go to the home page' }}
        </RouterLink>
        <RouterLink to="/events" class="btn btn-outline">
          <Compass :size="18" aria-hidden="true" /> Browse events
        </RouterLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.status-page {
  display: grid;
  place-items: center;
  min-height: 60vh;
}
.status-card {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 560px;
  padding: 48px 36px 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.code {
  position: absolute;
  top: -18px;
  right: 14px;
  margin: 0;
  font-family: var(--font-display);
  font-size: 7rem;
  font-weight: 800;
  line-height: 1;
  color: var(--pink-soft);
  user-select: none;
}
.icon-tile {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: var(--pink);
  color: #fff;
  box-shadow: 0 6px 16px rgba(236, 106, 147, 0.3);
}
.title {
  position: relative;
  margin-top: 22px;
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  font-weight: 800;
}
.text {
  position: relative;
  margin: 12px 0 0;
  max-width: 44ch;
  color: var(--muted);
  line-height: 1.6;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 28px;
}
@media (max-width: 480px) {
  .status-card {
    padding: 40px 20px 28px;
  }
  .actions .btn {
    width: 100%;
  }
}
</style>
