<script setup>
import { ref, computed, onMounted } from 'vue';
import { RefreshCw, FlaskConical, CircleCheck, CircleX, CircleMinus, Loader2, Eye, Cpu, Copy } from 'lucide-vue-next';
import { api } from '@/api';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import { timeAgo, formatDateTime } from '@/utils/format';
import { copyText } from '@/utils/events';
import { toast } from '@/stores/toast';

// Is Ollama (the vision model behind art style matching, server/services/vision.js) working?
// A checklist from "is it set up" to "are the models there", a live test with timings, and how
// many style profiles have used it.
const report = ref(null);
const error = ref('');
const checking = ref(false);
const testing = ref(false);
const test = ref(null);

async function check() {
  checking.value = true;
  error.value = '';
  try {
    report.value = (await api('/admin/vision')).report;
  } catch (e) {
    error.value = e.message;
  } finally {
    checking.value = false;
  }
}
onMounted(check);

async function runTest() {
  testing.value = true;
  test.value = null;
  try {
    test.value = (await api('/admin/vision/test', { method: 'POST' })).result;
  } catch (e) {
    test.value = { ok: false, step: 'connect', error: e.message, timings: {} };
  } finally {
    testing.value = false;
    check();
  }
}

// The headline: working, partly working, down, or not set up
const state = computed(() => {
  const r = report.value;
  if (!r) return null;
  if (!r.configured) return { tone: 'off', title: 'Not set up', text: 'Style matching uses colours and texture only.' };
  if (!r.reachable) return { tone: 'down', title: 'Offline', text: r.error || "Ollama isn't answering." };
  if (!r.visionModel.installed || !r.embedModel.installed) {
    return { tone: 'partial', title: 'Missing a model', text: 'Ollama is up, but a model Drawsicle needs isn\'t downloaded yet.' };
  }
  return { tone: 'ok', title: 'Online', text: `Answering in ${r.latencyMs} ms. Style scans use the vision model.` };
});

const checklist = computed(() => {
  const r = report.value;
  if (!r) return [];
  return [
    {
      label: 'Address set (OLLAMA_URL)',
      ok: r.configured,
      detail: r.configured ? r.host : 'Add OLLAMA_URL to the server environment.',
    },
    {
      label: 'Cloudflare Access token',
      ok: r.protected ? true : null,
      detail: r.protected ? 'Sent with every request.' : 'Not set. Only needed when Ollama is reached through a Cloudflare Tunnel.',
    },
    {
      label: 'Ollama answering',
      ok: r.configured ? r.reachable : null,
      detail: r.reachable ? `${r.latencyMs} ms${r.version ? `, version ${r.version}` : ''}` : r.error || 'Not checked: no address yet.',
    },
    {
      label: `Vision model (${r.visionModel.name})`,
      ok: r.reachable ? r.visionModel.installed : null,
      detail: r.visionModel.installed ? 'Downloaded.' : `Run: ollama pull ${r.visionModel.name}`,
      command: r.reachable && !r.visionModel.installed ? `ollama pull ${r.visionModel.name}` : '',
    },
    {
      label: `Embedding model (${r.embedModel.name})`,
      ok: r.reachable ? r.embedModel.installed : null,
      detail: r.embedModel.installed ? 'Downloaded.' : `Run: ollama pull ${r.embedModel.name}`,
      command: r.reachable && !r.embedModel.installed ? `ollama pull ${r.embedModel.name}` : '',
    },
  ];
});

const STEPS = [
  { key: 'colour', label: 'Colours and texture', timing: 'colourMs' },
  { key: 'vision', label: 'Vision model', timing: 'visionMs' },
  { key: 'embedding', label: 'Embedding', timing: 'embedMs' },
];
const ORDER = ['connect', 'colour', 'vision', 'embedding', 'done'];
function stepState(key) {
  if (!test.value) return null;
  const reached = ORDER.indexOf(test.value.step);
  const mine = ORDER.indexOf(key);
  if (test.value.ok || mine < reached) return 'ok';
  if (mine === reached) return 'failed';
  return 'skipped';
}

async function copy(command) {
  if (await copyText(command)) toast.success('Copied.');
}
</script>

<template>
  <div class="vision">
    <LoadingBlock v-if="!report && !error" label="Checking on Ollama…" />
    <ErrorBlock v-else-if="error && !report" :message="error" @retry="check" />
    <template v-else-if="report">
      <!-- Headline -->
      <section class="card panel headline" :class="state.tone" aria-live="polite">
        <span class="dot" aria-hidden="true" />
        <div class="min-w-0">
          <h2 class="title">Vision model: {{ state.title }}</h2>
          <p class="muted m-0">{{ state.text }}</p>
          <p class="muted small m-0">
            Checked <time :datetime="report.checkedAt" :title="formatDateTime(report.checkedAt)">{{ timeAgo(report.checkedAt) }}</time>
          </p>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-outline btn-sm" :disabled="checking" @click="check">
            <RefreshCw :size="15" :class="{ spin: checking }" aria-hidden="true" /> Check again
          </button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="testing || !report.reachable" @click="runTest">
            <Loader2 v-if="testing" :size="15" class="spin" aria-hidden="true" />
            <FlaskConical v-else :size="15" aria-hidden="true" />
            {{ testing ? 'Looking at a test picture…' : 'Run a test' }}
          </button>
        </div>
      </section>

      <div class="grid">
        <!-- Checklist -->
        <section class="card panel" aria-labelledby="vision-checks">
          <h3 id="vision-checks" class="panel-title small-title">Checklist</h3>
          <ul class="checks">
            <li v-for="c in checklist" :key="c.label" class="check">
              <CircleCheck v-if="c.ok === true" :size="20" class="ok" aria-label="Done" />
              <CircleX v-else-if="c.ok === false" :size="20" class="bad" aria-label="Not done" />
              <CircleMinus v-else :size="20" class="na" aria-label="Not needed or not checked" />
              <div class="min-w-0">
                <p class="check-label">{{ c.label }}</p>
                <p class="muted small m-0">
                  {{ c.detail }}
                  <button v-if="c.command" type="button" class="copy" :aria-label="`Copy ${c.command}`" @click="copy(c.command)">
                    <Copy :size="13" aria-hidden="true" />
                  </button>
                </p>
              </div>
            </li>
          </ul>
          <p class="muted small help">
            Set-up: run <code>run-ollama.sh</code> (or <code>run-ollama.bat</code>) on the computer with the models, and see
            <code>docs/VISION.md</code> for the Cloudflare Tunnel that lets the deployed site reach it.
          </p>
        </section>

        <div class="side">
          <!-- Test -->
          <section class="card panel" aria-labelledby="vision-test">
            <h3 id="vision-test" class="panel-title small-title"><Eye :size="17" aria-hidden="true" /> Live test</h3>
            <p v-if="!test && !testing" class="muted small m-0">
              Sends a generated picture through each step a style scan uses and times them.
            </p>
            <p v-if="testing" class="muted small m-0">The first test after Ollama starts can take a minute while the model loads.</p>
            <ol v-if="test" class="steps">
              <li v-for="s in STEPS" :key="s.key" class="step" :class="stepState(s.key)">
                <CircleCheck v-if="stepState(s.key) === 'ok'" :size="18" class="ok" aria-hidden="true" />
                <CircleX v-else-if="stepState(s.key) === 'failed'" :size="18" class="bad" aria-hidden="true" />
                <CircleMinus v-else :size="18" class="na" aria-hidden="true" />
                <span class="step-label">{{ s.label }}</span>
                <span v-if="test.timings[s.timing] !== undefined" class="muted small">{{ test.timings[s.timing] }} ms</span>
              </li>
            </ol>
            <p v-if="test && !test.ok" class="error small" role="alert">{{ test.error }}</p>
            <template v-if="test?.ok">
              <p class="small m-0"><strong>It saw:</strong> {{ test.summary || 'no summary' }}</p>
              <ul class="chips">
                <li v-for="t in test.tags.slice(0, 12)" :key="t" class="chip">{{ t }}</li>
              </ul>
              <p class="muted small m-0">Embedding: {{ test.vectorLength }} numbers</p>
            </template>
          </section>

          <!-- Usage -->
          <section class="card panel" aria-labelledby="vision-usage">
            <h3 id="vision-usage" class="panel-title small-title">Style profiles</h3>
            <dl class="usage">
              <div><dt>Artists analysed</dt><dd>{{ report.profiles.total }}</dd></div>
              <div><dt>With the vision model</dt><dd>{{ report.profiles.withVision }}</dd></div>
              <div><dt>Colours only</dt><dd>{{ report.profiles.colourOnly }}</dd></div>
              <div>
                <dt>Last analysed</dt>
                <dd>{{ report.profiles.lastAnalysedAt ? timeAgo(report.profiles.lastAnalysedAt) : 'never' }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <!-- Models -->
      <section v-if="report.models.length" class="card panel" aria-labelledby="vision-models">
        <h3 id="vision-models" class="panel-title small-title"><Cpu :size="17" aria-hidden="true" /> Models on that computer</h3>
        <table class="models">
          <thead>
            <tr><th scope="col">Model</th><th scope="col">Size</th><th scope="col">Updated</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in report.models" :key="m.name">
              <td>
                {{ m.name }}
                <span v-if="m.name.split(':')[0] === report.visionModel.name.split(':')[0]" class="tag">vision</span>
                <span v-if="m.name.split(':')[0] === report.embedModel.name.split(':')[0]" class="tag">embedding</span>
              </td>
              <td>{{ m.sizeGb ? `${m.sizeGb} GB` : '–' }}</td>
              <td>{{ m.modifiedAt ? timeAgo(m.modifiedAt) : '–' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.vision .card {
  padding: 18px 20px;
}
.vision {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.headline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  box-shadow: inset 6px 0 0 var(--muted);
}
.headline.ok {
  box-shadow: inset 6px 0 0 #3ecf6e;
}
.headline.partial {
  box-shadow: inset 6px 0 0 #f0b429;
}
.headline.down {
  box-shadow: inset 6px 0 0 #e5484d;
}
.dot {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
}
.ok .dot {
  background: #3ecf6e;
  box-shadow: 0 0 0 5px rgba(62, 207, 110, 0.2);
}
.partial .dot {
  background: #f0b429;
}
.down .dot {
  background: #e5484d;
}
.title {
  margin: 0;
  font-size: 1.15rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.checks,
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.check-label {
  margin: 0;
  font-weight: 700;
}
.ok {
  color: #2fa75b;
}
.bad {
  color: #e5484d;
}
.na {
  color: var(--muted);
}
.copy {
  display: inline-grid;
  place-items: center;
  margin-left: 4px;
  padding: 2px;
  border: 0;
  background: none;
  color: var(--pink-dark);
  cursor: pointer;
  vertical-align: middle;
}
.help {
  margin: 14px 0 0;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-label {
  font-weight: 600;
}
.step .muted {
  margin-left: auto;
}
.error {
  margin: 10px 0 0;
  color: var(--danger, #c4314f);
}
.chips {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
  padding: 0;
}
.chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--pink-soft);
  font-size: 0.8rem;
  font-weight: 600;
}
.usage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}
.usage dt {
  color: var(--muted);
  font-size: 0.78rem;
}
.usage dd {
  margin: 2px 0 0;
  font-size: 1.2rem;
  font-weight: 800;
}
.models {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.models th,
.models td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.tag {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 0.72rem;
  font-weight: 700;
}
code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-2);
  font-size: 0.85em;
}
</style>
