<script setup>
// Full-page message for 404 / 403 style dead ends: big faded code, an icon, a title, some text and
// buttons that lead somewhere. It renders the page's <main>.
//   <StatusPage code="404" :icon="Signpost" title="We couldn't find that page">
//     <p>Text…</p>
//     <template #search>…optional form…</template>
//     <template #actions>…buttons…</template>
//   </StatusPage>
defineProps({
  code: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
});
</script>

<template>
  <main id="main" class="page status-page">
    <div class="card status-card">
      <p v-if="code" class="code" aria-hidden="true">{{ code }}</p>
      <span v-if="icon" class="icon-tile" aria-hidden="true"><component :is="icon" :size="30" /></span>
      <h1 class="title">{{ title }}</h1>
      <div v-if="$slots.default" class="text"><slot /></div>
      <div v-if="$slots.search" class="search"><slot name="search" /></div>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
      <div v-if="$slots.footer" class="foot"><slot name="footer" /></div>
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
  padding: 48px 36px 36px;
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
  color: color-mix(in srgb, var(--pink) 28%, transparent);
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
  margin-top: 12px;
  max-width: 46ch;
  color: var(--muted);
  line-height: 1.6;
}
.text :deep(p) {
  margin: 0 0 10px;
}
.text :deep(p:last-child) {
  margin-bottom: 0;
}
.text :deep(code) {
  display: inline-block;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--hover);
  color: var(--text);
  font-size: 0.9em;
  overflow-wrap: anywhere;
}
.text :deep(a) {
  font-weight: 700;
  text-decoration: underline;
}
.search {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin-top: 24px;
  text-align: left;
}
.actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}
.foot {
  position: relative;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
  width: 100%;
  color: var(--muted);
  font-size: 0.93rem;
  line-height: 1.55;
}
.foot :deep(a),
.foot :deep(button.link) {
  font-weight: 700;
}
@media (max-width: 480px) {
  .status-card {
    padding: 40px 18px 28px;
  }
  .actions :deep(.btn) {
    width: 100%;
  }
}
</style>
