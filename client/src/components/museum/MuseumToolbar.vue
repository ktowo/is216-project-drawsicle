<script setup>
import { ref, computed, onBeforeUnmount, useId } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { Users, MessagesSquare, Smile, Send, Loader2 } from 'lucide-vue-next';
import PixelHead from './PixelHead.vue';
import { CHAT, EMOTES, parseChat } from '@shared/chat.mjs';
import { formatDateTime } from '@/utils/format';

// The bar under the room: your head (opens your card), friends, the chat history, emotes, and
// the chat box. send(text) does the talking and throws the API's error, which shows here.
const props = defineProps({
  me: { type: Object, default: null },
  send: { type: Function, required: true },
  mutedUntil: { type: [String, Date], default: null },
  open: { type: String, default: '' }, // which panel is open: me | friends | log
  logCount: { type: Number, default: 0 },
  dancing: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'command']);

const route = useRoute();
const uid = useId();
const text = ref('');
const sending = ref(false);
const problem = ref('');
const emotesOpen = ref(false);
const inputRef = ref(null);

// Cooldown: counted down here so the button says how long is left
const readyAt = ref(0);
const clock = ref(Date.now());
let ticker = null;
function startCooldown(ms) {
  readyAt.value = Date.now() + ms;
  clearInterval(ticker);
  ticker = setInterval(() => {
    clock.value = Date.now();
    if (clock.value >= readyAt.value) clearInterval(ticker);
  }, 200);
  clock.value = Date.now();
}
onBeforeUnmount(() => clearInterval(ticker));
const waitLeft = computed(() => Math.max(0, readyAt.value - clock.value));
const muted = computed(() => props.mutedUntil && new Date(props.mutedUntil) > new Date());

async function submit(value = text.value) {
  problem.value = '';
  const parsed = parseChat(value);
  if (parsed.error) {
    problem.value = parsed.error;
    return;
  }
  if (parsed.command) {
    emit('command', parsed.command);
    text.value = '';
    return;
  }
  if (waitLeft.value > 0 || sending.value) return;
  sending.value = true;
  try {
    await props.send(value);
    text.value = '';
    startCooldown(parsed.kind === 'emote' ? CHAT.emoteGapMs : CHAT.gapMs);
  } catch (e) {
    problem.value = e.message;
    if (e.data?.retryAfterMs) startCooldown(e.data.retryAfterMs);
  } finally {
    sending.value = false;
    inputRef.value?.focus();
  }
}

function emote(key) {
  emotesOpen.value = false;
  submit(`/${key}`);
}

// The dance button stops the dance once you're dancing
function quick(key) {
  if (key === 'dance' && props.dancing) emit('command', 'stop');
  else emote(key);
}

defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <div class="toolbar">
    <div class="tools">
      <button
        v-if="me"
        type="button"
        class="tool me"
        :class="{ on: open === 'me' }"
        :aria-pressed="open === 'me' ? 'true' : 'false'"
        aria-label="You: your card, sit down and links"
        @click="emit('toggle', 'me')"
      >
        <PixelHead :user="me" :size="30" />
      </button>
      <button
        v-if="me"
        type="button"
        class="tool"
        :class="{ on: open === 'friends' }"
        :aria-pressed="open === 'friends' ? 'true' : 'false'"
        @click="emit('toggle', 'friends')"
      >
        <Users :size="18" aria-hidden="true" /> <span class="tool-label">Friends</span>
      </button>
      <button
        type="button"
        class="tool"
        :class="{ on: open === 'log' }"
        :aria-pressed="open === 'log' ? 'true' : 'false'"
        @click="emit('toggle', 'log')"
      >
        <MessagesSquare :size="18" aria-hidden="true" /> <span class="tool-label">Chat</span>
        <span v-if="logCount" class="count">{{ logCount }}</span>
      </button>
    </div>

    <div v-if="me && !muted" class="quick" role="group" aria-label="Quick emotes">
      <button
        v-for="(e, i) in EMOTES"
        :key="e.key"
        type="button"
        class="quick-emote"
        :class="{ on: e.key === 'dance' && dancing }"
        :aria-pressed="e.key === 'dance' ? (dancing ? 'true' : 'false') : undefined"
        :title="e.key === 'dance' && dancing ? 'Stop dancing' : `${e.label} (${i + 1})`"
        :disabled="waitLeft > 0 && !(e.key === 'dance' && dancing)"
        @click="quick(e.key)"
      >
        <span aria-hidden="true">{{ e.icon }}</span>
        <span class="sr-only">{{ e.key === 'dance' && dancing ? 'Stop dancing' : e.label }}</span>
      </button>
    </div>

    <form v-if="me && !muted" class="say" @submit.prevent="submit()">
      <div class="emotes-wrap">
        <button
          type="button"
          class="tool"
          :aria-expanded="emotesOpen ? 'true' : 'false'"
          :aria-controls="`${uid}-emotes`"
          aria-label="Emotes"
          @click="emotesOpen = !emotesOpen"
        >
          <Smile :size="18" aria-hidden="true" />
        </button>
        <div v-if="emotesOpen" :id="`${uid}-emotes`" class="emotes card" role="menu">
          <button v-for="e in EMOTES" :key="e.key" type="button" role="menuitem" class="emote" @click="emote(e.key)">
            <span aria-hidden="true">{{ e.icon }}</span> {{ e.label }}
          </button>
        </div>
      </div>
      <label :for="`${uid}-say`" class="sr-only">Say something in the room</label>
      <input
        :id="`${uid}-say`"
        ref="inputRef"
        v-model="text"
        class="say-input"
        :maxlength="CHAT.maxLength + 20"
        autocomplete="off"
        placeholder="Say something… (try /wave or /sit)"
        :aria-describedby="problem ? `${uid}-problem` : undefined"
        @keydown.esc="text = ''"
      />
      <button type="submit" class="send" :disabled="sending || waitLeft > 0 || !text.trim()">
        <Loader2 v-if="sending" :size="16" class="spin" aria-hidden="true" />
        <template v-else-if="waitLeft > 0">{{ Math.ceil(waitLeft / 1000) }}s</template>
        <Send v-else :size="16" aria-hidden="true" />
        <span class="sr-only">Send</span>
      </button>
    </form>
    <p v-else-if="me && muted" class="note">
      A moderator paused your chat until {{ formatDateTime(mutedUntil) }}. You can still walk around and look.
    </p>
    <p v-else class="note">
      <RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">Log in</RouterLink> to chat, sit down and
      meet your friends here.
    </p>
    <p v-if="problem" :id="`${uid}-problem`" class="problem" role="status">{{ problem }}</p>
  </div>
</template>

<style scoped>
.toolbar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 10px;
  background: #1b1f2c;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #f3eaf0;
}
.tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tool {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #2a2f40;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.tool.me {
  padding: 3px;
  --museum-head-bg: #3a4056;
}
.tool:hover,
.tool.on {
  background: #3a4056;
  border-color: #ec6a93;
}
.tool:focus-visible,
.send:focus-visible,
.say-input:focus-visible {
  outline: 3px solid #ec6a93;
  outline-offset: 1px;
}
.count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ec6a93;
  color: #fff;
  font-size: 0.72rem;
  text-align: center;
}
.say {
  flex: 1 1 260px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.say-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  background: #fffdf8;
  color: #2b2230;
  font: inherit;
  font-size: 0.9rem;
}
.send {
  display: grid;
  place-items: center;
  min-width: 42px;
  height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: #ec6a93;
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.55;
  cursor: default;
}
.emotes-wrap {
  position: relative;
}
.quick {
  display: flex;
  gap: 3px;
}
.quick-emote {
  display: grid;
  place-items: center;
  width: 36px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #2a2f40;
  font-size: 1.05rem;
  cursor: pointer;
  transition: transform 0.12s;
}
.quick-emote:hover:not(:disabled) {
  transform: translateY(-2px);
  background: #3a4056;
}
.quick-emote.on {
  border-color: #ec6a93;
  background: rgba(236, 106, 147, 0.3);
}
.quick-emote:disabled {
  opacity: 0.45;
  cursor: default;
}
.quick-emote:focus-visible {
  outline: 3px solid #ec6a93;
  outline-offset: 1px;
}
/* Narrow screens keep the emotes in the smiley menu instead */
@media (max-width: 720px) {
  .quick {
    display: none;
  }
}
@media (min-width: 721px) {
  .emotes-wrap {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .quick-emote {
    transition: none;
  }
}
.emotes {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: 220px;
  padding: 8px;
}
.emote {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.emote:hover,
.emote:focus-visible {
  background: var(--pink-soft);
}
.note {
  flex: 1 1 260px;
  margin: 0;
  font-size: 0.85rem;
}
.note a {
  color: #f6a5c0;
  font-weight: 700;
}
.problem {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.82rem;
  color: #ffb4c6;
}
@media (max-width: 520px) {
  .tool-label {
    display: none;
  }
}
</style>
