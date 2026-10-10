<script setup>
// Shared shell for login / register / reset screens: pink icon tile, title, card, footer link.
defineProps({
  icon: { required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <main class="auth-page">
    <div class="auth-inner">
      <div class="icon-tile">
        <component :is="icon" :size="32" :stroke-width="2.2" />
      </div>
      <h1 class="auth-title">{{ title }}</h1>
      <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>

      <div class="card auth-card">
        <slot />
      </div>

      <div v-if="$slots.footer" class="auth-footer">
        <slot name="footer" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 64px 16px;
}
.auth-inner {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.icon-tile {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--pink);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 16px rgba(236, 106, 147, 0.3);
}
.auth-title {
  margin-top: 26px;
  font-size: 2.4rem;
  font-weight: 800;
}
.auth-subtitle {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 1.1rem;
}
.auth-card {
  width: 100%;
  margin-top: 40px;
  padding: 36px 32px;
  text-align: left;
}
.auth-footer {
  margin-top: 28px;
  color: var(--muted);
}
@media (max-width: 480px) {
  .auth-page {
    padding-top: 40px;
  }
  .auth-card {
    padding: 28px 20px;
  }
  .auth-title {
    font-size: 2rem;
  }
}
</style>
