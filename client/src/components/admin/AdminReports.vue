<script setup>
import { ref, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Flag, ExternalLink, Check, X, Undo2, ImageOff } from 'lucide-vue-next';
import { api, qs, assetUrl } from '@/api';
import { toast } from '@/stores/toast';
import { REPORT_REASONS, REPORT_STATUS_LABELS, CONTENT_WARNINGS } from '@shared/constants.mjs';
import TabNav from '@/components/ui/TabNav.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ReasonDialog from './ReasonDialog.vue';
import { linkableUser } from './helpers.js';
import { formatDateTime, timeAgo } from '@/utils/format';

const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const WARNING_LABELS = Object.fromEntries(CONTENT_WARNINGS.map((w) => [w.value, w.label]));
const TARGET_LABELS = { submission: 'Gift', user: 'Profile', character: 'Character', event: 'Event' };

const status = ref('open');
const page = ref(1);
const data = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api(`/admin/reports${qs({ status: status.value, page: page.value })}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(status, () => {
  page.value = 1;
  load();
});
watch(page, load);
onMounted(load);

const tabs = () => [
  { key: 'open', label: 'Open', count: data.value?.counts?.open ?? 0 },
  { key: 'resolved', label: REPORT_STATUS_LABELS.resolved, count: data.value?.counts?.resolved ?? 0 },
  { key: 'dismissed', label: REPORT_STATUS_LABELS.dismissed, count: data.value?.counts?.dismissed ?? 0 },
];

// ---- Close or reopen ----
const DIALOGS = {
  resolved: {
    title: 'Mark as action taken?',
    message: 'Say what you did (for example, banned the account or disabled the event). Other admins see this note; the reporter gets a short thank-you.',
    confirmLabel: 'Action taken',
    required: true,
    placeholder: 'What did you do?',
  },
  dismissed: {
    title: 'Close with no action?',
    message: "Use this when it doesn't break the guidelines. The reporter is told an admin looked at it.",
    confirmLabel: 'Close report',
    required: false,
    placeholder: 'Why nothing was needed (only admins see this)',
  },
};
const pending = ref(null);
const working = ref(false);

async function setStatus(report, next, resolution = '') {
  working.value = true;
  try {
    await api(`/admin/reports/${report.id}`, { method: 'PATCH', body: { status: next, resolution } });
    toast.success(next === 'open' ? 'Report reopened.' : 'Report closed.');
    pending.value = null;
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <div class="grid gap-5">
    <p class="hint m-0">
      People can report gifts, profiles, characters and events. Check what was reported, use the Accounts and Events tabs
      if something needs doing, then close the report here.
    </p>
    <TabNav v-model="status" :tabs="tabs()" />

    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading reports…" />
    <EmptyState
      v-else-if="!data.reports.length"
      :icon="Flag"
      :title="status === 'open' ? 'Nothing to review' : 'No reports here'"
      :message="status === 'open' ? 'New reports show up here, oldest first.' : 'Closed reports are kept here for reference.'"
    />
    <template v-else>
      <ul class="rows" :class="{ dim: loading }">
        <li v-for="r in data.reports" :key="r.id" class="card report">
          <header class="head">
            <span class="kind">{{ TARGET_LABELS[r.targetType] }}</span>
            <h3 class="target">
              <RouterLink v-if="r.link" :to="r.link">{{ r.targetLabel }} <ExternalLink :size="13" aria-hidden="true" /></RouterLink>
              <span v-else>{{ r.targetLabel }}</span>
            </h3>
            <span v-if="r.targetGone" class="chip">Removed since</span>
          </header>

          <p class="meta">
            <strong>{{ REASON_LABELS[r.reason] || r.reason }}</strong> · reported by
            <PersonLink :user="linkableUser(r.reporter)" :size="0" />
            · <time :datetime="r.createdAt" :title="formatDateTime(r.createdAt)">{{ timeAgo(r.createdAt) }}</time>
            <template v-if="r.owner">
              · belongs to <PersonLink :user="linkableUser(r.owner)" :size="0" />
            </template>
            <template v-if="r.event && r.targetType !== 'event'">
              · in <RouterLink :to="`/events/${r.event.id}`">{{ r.event.name }}</RouterLink>
            </template>
          </p>
          <blockquote v-if="r.details" class="details">{{ r.details }}</blockquote>

          <div v-if="r.preview" class="preview">
            <template v-if="r.targetType === 'submission'">
              <div v-if="r.preview.images.length" class="thumbs">
                <a v-for="src in r.preview.images" :key="src" :href="assetUrl(src)" target="_blank" rel="noopener">
                  <img :src="assetUrl(src)" alt="Reported gift image" loading="lazy" />
                </a>
              </div>
              <p v-else class="hint m-0"><ImageOff :size="14" aria-hidden="true" /> No images</p>
              <p v-if="r.preview.message" class="quote">"{{ r.preview.message }}"</p>
              <p v-for="url in r.preview.links" :key="url" class="m-0 link-line">
                <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
              </p>
            </template>
            <template v-else-if="r.targetType === 'character'">
              <p v-if="r.preview.description" class="m-0">{{ r.preview.description }}</p>
              <p v-if="r.preview.notesForArtists" class="quote">Notes for artists: {{ r.preview.notesForArtists }}</p>
              <p v-for="url in r.preview.referenceLinks" :key="url" class="m-0 link-line">
                <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
              </p>
            </template>
            <template v-else-if="r.targetType === 'user'">
              <p class="m-0">{{ r.preview.bio || 'No bio.' }}</p>
              <p v-if="r.preview.status !== 'active'" class="hint m-0">This account is {{ r.preview.status }}.</p>
            </template>
            <template v-else-if="r.targetType === 'event'">
              <p class="m-0 clamp">{{ r.preview.description || 'No description.' }}</p>
              <p v-if="r.preview.disabled" class="hint m-0">This event is disabled.</p>
            </template>
            <p v-if="r.preview.contentWarnings?.length" class="hint m-0">
              Marked: {{ r.preview.contentWarnings.map((w) => WARNING_LABELS[w] || w).join(', ') }}
            </p>
          </div>

          <p v-if="r.status !== 'open'" class="handled">
            {{ REPORT_STATUS_LABELS[r.status] }}
            <template v-if="r.handledBy"> by <PersonLink :user="r.handledBy" :size="0" /></template>
            <template v-if="r.handledAt">
              · <time :datetime="r.handledAt" :title="formatDateTime(r.handledAt)">{{ timeAgo(r.handledAt) }}</time>
            </template>
            <template v-if="r.resolution">: "{{ r.resolution }}"</template>
          </p>

          <div class="actions">
            <template v-if="r.status === 'open'">
              <button class="btn btn-outline btn-sm" :disabled="working" @click="pending = { report: r, next: 'resolved', ...DIALOGS.resolved }">
                <Check :size="16" aria-hidden="true" /> Action taken
              </button>
              <button class="btn btn-ghost btn-sm" :disabled="working" @click="pending = { report: r, next: 'dismissed', ...DIALOGS.dismissed }">
                <X :size="16" aria-hidden="true" /> No action needed
              </button>
            </template>
            <button v-else class="btn btn-ghost btn-sm" :disabled="working" @click="setStatus(r, 'open')">
              <Undo2 :size="16" aria-hidden="true" /> Reopen
            </button>
          </div>
        </li>
      </ul>
      <nav v-if="data.pages > 1" class="pager" aria-label="Pages">
        <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--">Previous</button>
        <span class="hint">Page {{ data.page }} of {{ data.pages }}</span>
        <button class="btn btn-outline btn-sm" :disabled="page >= data.pages" @click="page++">Next</button>
      </nav>
    </template>

    <ReasonDialog
      v-if="pending"
      :open="true"
      :title="pending.title"
      :message="pending.message"
      :confirm-label="pending.confirmLabel"
      :required="pending.required"
      :placeholder="pending.placeholder"
      :loading="working"
      @confirm="(note) => setStatus(pending.report, pending.next, note)"
      @cancel="pending = null"
    />
  </div>
</template>

<style scoped>
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
  transition: opacity 0.15s;
}
.rows.dim {
  opacity: 0.6;
}
.report {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.kind {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.78rem;
  font-weight: 700;
}
.target {
  margin: 0;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}
.target a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
}
.meta {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
}
.details {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--warning);
  background: var(--surface-2);
  border-radius: 0 10px 10px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  font-size: 0.9rem;
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.thumbs img {
  width: 84px;
  height: 84px;
  object-fit: cover;
  border-radius: 8px;
}
.quote {
  margin: 0;
  color: var(--muted);
  font-style: italic;
  overflow-wrap: anywhere;
}
.link-line {
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.handled {
  margin: 0;
  font-size: 0.88rem;
  color: var(--success);
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
</style>
