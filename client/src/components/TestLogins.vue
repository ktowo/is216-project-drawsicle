<script setup>
// Testing aid until the final presentation (see utils/testLogins.js for how to remove it)
import { ref, computed, onMounted } from 'vue';
import { FlaskConical, RotateCcw } from 'lucide-vue-next';
import { isMockMode } from '@/api';
import { loadTestAccounts } from '@/utils/testLogins';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

const props = defineProps({
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['pick', 'login']);

const groups = ref([]);
const password = ref('');
const selected = ref('');
const confirmingReset = ref(false);
const resetting = ref(false);

const account = computed(() => groups.value.flatMap((g) => g.accounts).find((a) => a.email === selected.value));

onMounted(async () => {
  const list = await loadTestAccounts();
  groups.value = list.groups;
  password.value = list.password;
});

function pick() {
  if (account.value) emit('pick', { email: account.value.email, password: password.value });
}

function signIn() {
  if (account.value) emit('login', { email: account.value.email, password: password.value });
}

// GitHub Pages build only: its data lives in this browser
async function resetDemoData() {
  resetting.value = true;
  const { resetMockData } = await import('../mock/index.js');
  resetMockData();
  location.reload();
}
</script>

<template>
  <section class="test-logins" aria-labelledby="test-logins-title">
    <div class="head">
      <FlaskConical :size="17" aria-hidden="true" />
      <h2 id="test-logins-title">Test accounts</h2>
      <span class="tag">for testing, removed before finals</span>
    </div>

    <div class="row">
      <label for="test-account" class="sr-only">Test account</label>
      <select id="test-account" v-model="selected" class="select" @change="pick">
        <option value="" disabled>Choose an account…</option>
        <optgroup v-for="g in groups" :key="g.label" :label="g.label">
          <option v-for="a in g.accounts" :key="a.email" :value="a.email">{{ a.name }} · {{ a.note }}</option>
        </optgroup>
      </select>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!account || props.busy" @click="signIn">
        {{ account ? `Sign in as ${account.name.replace(/\s*\(.*\)$/, '')}` : 'Sign in' }}
      </button>
    </div>

    <p class="hint m-0">
      Every account's password is <code>{{ password }}</code>.
      <button v-if="isMockMode" type="button" class="reset" @click="confirmingReset = true">
        <RotateCcw :size="13" aria-hidden="true" /> Reset test data
      </button>
    </p>

    <ConfirmDialog
      :open="confirmingReset"
      title="Reset the test data?"
      message="Everything made in this browser (events, sign-ups, uploads) goes back to the starting set, and you're logged out."
      confirm-label="Reset"
      danger
      :loading="resetting"
      @confirm="resetDemoData"
      @cancel="confirmingReset = false"
    />
  </section>
</template>

<style scoped>
.test-logins {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
  padding: 14px 16px;
  border: 1.5px dashed var(--pink-line);
  border-radius: var(--radius);
  background: var(--pink-tint);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--pink-dark);
}
.head h2 {
  margin: 0;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}
.tag {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}
.row {
  display: flex;
  gap: 8px;
}
.select {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 9px 10px;
}
.select:focus {
  outline: none;
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft);
}
.row .btn {
  white-space: nowrap;
}
code {
  font-size: 0.85em;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--chip);
}
.reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: var(--pink);
  cursor: pointer;
}
.reset:hover {
  text-decoration: underline;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 420px) {
  .row {
    flex-direction: column;
  }
}
</style>
