<script setup>
import { ref, onMounted, useId } from 'vue';
import { UserX, Loader2, X } from 'lucide-vue-next';
import PersonLink from '@/components/events/PersonLink.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { LIMITS } from '@shared/constants.mjs';

// "People you won't be matched with": a private list; matching keeps you apart both ways.
const uid = useId();
const blocks = ref([]);
const loaded = ref(false);
const username = ref('');
const adding = ref(false);
const error = ref('');
const removingId = ref(null);

onMounted(async () => {
  try {
    blocks.value = (await api('/profile/blocks')).blocks || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loaded.value = true;
  }
});

async function add() {
  error.value = '';
  const handle = username.value.trim().replace(/^@/, '');
  if (!handle) {
    error.value = 'Type their username.';
    return;
  }
  adding.value = true;
  try {
    blocks.value = (await api('/profile/blocks', { method: 'POST', body: { username: handle } })).blocks;
    username.value = '';
    toast.success("Added. You won't be matched with them, either way round.");
  } catch (e) {
    error.value = e.message;
  } finally {
    adding.value = false;
  }
}

async function remove(person) {
  removingId.value = person.id;
  try {
    blocks.value = (await api(`/profile/blocks/${person.id}`, { method: 'DELETE' })).blocks;
  } catch (e) {
    toast.error(e.message);
  } finally {
    removingId.value = null;
  }
}
</script>

<template>
  <section class="card panel" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="section-title"><UserX :size="20" aria-hidden="true" /> People you won't be matched with</h2>
    <p class="section-sub sub">
      Private to you: nobody else, organisers included, can see this list. Matching keeps you apart in every exchange,
      whoever would be making the gift.
    </p>

    <ul v-if="blocks.length" class="list">
      <li v-for="person in blocks" :key="person.id" class="row">
        <PersonLink :user="person" :size="32" show-handle />
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="removingId === person.id"
          :aria-label="`Take ${person.displayName} off the list`"
          @click="remove(person)"
        >
          <X :size="14" aria-hidden="true" /> Remove
        </button>
      </li>
    </ul>
    <p v-else-if="loaded" class="hint m-0">Nobody on your list.</p>

    <form class="add" novalidate @submit.prevent="add">
      <label :for="`${uid}-username`" class="sr-only">Username to add</label>
      <div class="input-wrap grow">
        <span class="at" aria-hidden="true">@</span>
        <input
          :id="`${uid}-username`"
          v-model="username"
          class="input"
          autocapitalize="none"
          spellcheck="false"
          maxlength="31"
          placeholder="their username"
        />
      </div>
      <button type="submit" class="btn btn-outline btn-sm" :disabled="adding || blocks.length >= LIMITS.blockedUsers">
        <Loader2 v-if="adding" :size="16" class="spin" aria-hidden="true" /> Add
      </button>
    </form>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.panel {
  padding: 32px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub {
  margin-bottom: 18px;
  max-width: 70ch;
}
.list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  max-width: 520px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}
.row:first-child {
  border-top: 0;
}
.add {
  display: flex;
  gap: 8px;
  max-width: 520px;
  margin-top: 8px;
}
.grow {
  flex: 1;
  min-width: 0;
}
.grow .input {
  padding: 10px 0;
}
.at {
  color: var(--muted);
  font-weight: 600;
}
@media (max-width: 640px) {
  .panel {
    padding: 24px 18px;
  }
}
</style>
