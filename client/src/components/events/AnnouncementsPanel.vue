<script setup>
import { ref, computed, watch, useId } from 'vue';
import { Megaphone, Loader2, Trash2, Send } from 'lucide-vue-next';
import PersonLink from './PersonLink.vue';
import { api, qs } from '@/api';
import { toast } from '@/stores/toast';
import { timeAgo, formatDateTime } from '@/utils/format';
import { LIMITS } from '@shared/constants.mjs';

// Updates from the organisers ("Deadline moved to Friday!"). Everyone who can see the event reads
// them; organisers (canPost) can post and delete. Members get a notification for each new one.
const props = defineProps({
  event: { type: Object, required: true },
  canPost: { type: Boolean, default: false },
  invite: { type: String, default: '' },
  // Hide the whole panel when there's nothing to show and you can't post
  hideWhenEmpty: { type: Boolean, default: true },
});

const uid = useId();
const items = ref([]);
const loaded = ref(false);
const message = ref('');
const notifyMembers = ref(true);
const postToDiscord = ref(true);
const posting = ref(false);
const error = ref('');
const deletingId = ref(null);

async function load() {
  try {
    const data = await api(`/events/${props.event.id}/announcements${qs({ invite: props.invite || undefined })}`);
    items.value = data.announcements || [];
  } catch {
    items.value = [];
  } finally {
    loaded.value = true;
  }
}
watch(() => props.event.id, load, { immediate: true });

const hasDiscord = computed(() => Boolean(props.event.discordWebhookUrl));
const isDraft = computed(() => props.event.status === 'draft');
const show = computed(() => props.canPost || !props.hideWhenEmpty || items.value.length > 0);

async function post() {
  error.value = '';
  const text = message.value.trim();
  if (!text) {
    error.value = 'Write your update first.';
    return;
  }
  posting.value = true;
  try {
    const { announcement } = await api(`/events/${props.event.id}/announcements`, {
      method: 'POST',
      body: { message: text, notify: notifyMembers.value, postToDiscord: hasDiscord.value && postToDiscord.value },
    });
    items.value = [announcement, ...items.value];
    message.value = '';
    toast.success(isDraft.value ? 'Update posted. People will see it once sign-ups open.' : 'Update posted.');
  } catch (e) {
    error.value = e.message;
  } finally {
    posting.value = false;
  }
}

async function remove(item) {
  deletingId.value = item.id;
  try {
    await api(`/events/${props.event.id}/announcements/${item.id}`, { method: 'DELETE' });
    items.value = items.value.filter((a) => a.id !== item.id);
  } catch (e) {
    toast.error(e.message);
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <section v-if="loaded && show" class="card panel announcements" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="panel-title"><Megaphone :size="20" aria-hidden="true" /> Updates from the organisers</h2>

    <form v-if="canPost" class="post" novalidate @submit.prevent="post">
      <label :for="`${uid}-message`" class="sr-only">New update</label>
      <textarea
        :id="`${uid}-message`"
        v-model="message"
        class="post-input"
        rows="3"
        :maxlength="LIMITS.announcement"
        placeholder="Share news with everyone in this exchange, e.g. a deadline change or a reminder about the rules."
      />
      <div class="post-row">
        <label class="check">
          <input v-model="notifyMembers" type="checkbox" />
          <span>Notify everyone who signed up</span>
        </label>
        <label v-if="hasDiscord" class="check">
          <input v-model="postToDiscord" type="checkbox" />
          <span>Also post it to Discord</span>
        </label>
        <span class="count">{{ message.trim().length }}/{{ LIMITS.announcement }}</span>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="posting">
          <Loader2 v-if="posting" :size="16" class="spin" aria-hidden="true" />
          <Send v-else :size="16" aria-hidden="true" />
          Post update
        </button>
      </div>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    </form>

    <p v-if="!items.length" class="empty">No updates yet.</p>
    <ol v-else class="list">
      <li v-for="item in items" :key="item.id" class="item">
        <div class="item-head">
          <PersonLink :user="item.author" :size="24" />
          <time class="when" :datetime="item.createdAt" :title="formatDateTime(item.createdAt)">{{ timeAgo(item.createdAt) }}</time>
          <button
            v-if="canPost"
            type="button"
            class="btn btn-ghost btn-xs btn-danger-text delete"
            :disabled="deletingId === item.id"
            :aria-label="`Delete the update from ${formatDateTime(item.createdAt)}`"
            @click="remove(item)"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
        <p class="text">{{ item.message }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.panel {
  padding: 22px 24px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 1.2rem;
  margin-bottom: 12px;
}
.post {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.post-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  resize: vertical;
}
.post-input:focus {
  outline: none;
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft);
}
.post-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}
.check input {
  width: 16px;
  height: 16px;
  accent-color: var(--pink);
}
.count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--muted);
}
.empty {
  margin: 0;
  color: var(--muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.item + .item {
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.item-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.when {
  font-size: 0.85rem;
  color: var(--muted);
}
.delete {
  margin-left: auto;
}
.text {
  margin: 8px 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
</style>
