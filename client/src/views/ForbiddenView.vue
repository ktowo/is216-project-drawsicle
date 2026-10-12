<script setup>
import { RouterLink } from 'vue-router';
import { LockKeyhole, House, Compass, LogIn } from 'lucide-vue-next';
import { auth } from '@/stores/auth';
</script>

<template>
  <main id="main" class="page status-page">
    <div class="card status-card">
      <p class="code" aria-hidden="true">403</p>
      <span class="icon-tile" aria-hidden="true"><LockKeyhole :size="30" /></span>
      <h1 class="title">This page isn't open to you</h1>
      <p v-if="auth.user" class="text">
        Only an event's organisers can see this page. If you should be helping run the event, ask one of its organisers
        to add you.
      </p>
      <p v-else class="text">You need to log in first, and the page may only be open to an event's organisers.</p>
      <div class="actions">
        <RouterLink v-if="!auth.user" to="/login" class="btn btn-primary">
          <LogIn :size="18" aria-hidden="true" /> Log in
        </RouterLink>
        <RouterLink v-else to="/dashboard" class="btn btn-primary">
          <House :size="18" aria-hidden="true" /> Go to your dashboard
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
