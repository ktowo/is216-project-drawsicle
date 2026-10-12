<script setup>
import { computed } from 'vue';
import { ArrowRight, ExternalLink, ImageOff } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { assetUrl } from '@/api';
import { formatDateTime } from '@/utils/format';
import { safeUrl, linkHost, typeLabel } from '@/utils/events';
import { personName } from './helpers';

// One submitted gift, as the organiser sees it when checking submissions.
const props = defineProps({
  open: { type: Boolean, default: false },
  row: { type: Object, default: null }, // { match, submission, overdue }
});
const emit = defineEmits(['close']);

const sub = computed(() => props.row?.submission || null);
const giver = computed(() => props.row?.match?.giver || null);
const recipient = computed(() => props.row?.match?.recipient || null);
const links = computed(() =>
  (sub.value?.links || []).map((l) => ({ ...l, href: safeUrl(l.url) })).filter((l) => l.href)
);
const title = computed(() => sub.value?.title || 'Untitled gift');

// Only real URLs open in a new tab (demo artwork can be an inline data: image, which browsers won't open)
function imageHref(url) {
  const full = assetUrl(url);
  return typeof full === 'string' && (/^https?:\/\//i.test(full) || full.startsWith('/')) ? full : null;
}
</script>

<template>
  <BaseModal :open="open" :title="title" size="lg" @close="emit('close')">
    <div v-if="sub" class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="inline-flex items-center gap-2 font-semibold">
          <UserAvatar :user="giver" :size="28" /> {{ personName(giver) }}
        </span>
        <ArrowRight :size="16" class="text-brand" aria-hidden="true" />
        <span class="sr-only">made a gift for</span>
        <span class="inline-flex items-center gap-2 font-semibold">
          <UserAvatar :user="recipient" :size="28" /> {{ personName(recipient) }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm text-cocoa">
        <span class="badge badge-role">{{ typeLabel(sub.type) }}</span>
        <StatusBadge :status="sub.late ? 'late' : 'on_time'" kind="submission" />
        <StatusBadge v-if="sub.verified" status="verified" kind="submission" />
        <!-- submittedAt moves on every edit, so it is also the "last changed" time -->
        <span>Submitted {{ formatDateTime(sub.submittedAt) }}</span>
        <span v-if="sub.verified && sub.verifiedAt">· Verified {{ formatDateTime(sub.verifiedAt) }}</span>
      </div>

      <div v-if="sub.images?.length" class="images" :class="{ single: sub.images.length === 1 }">
        <template v-for="(url, i) in sub.images" :key="url">
          <a
            v-if="imageHref(url)"
            :href="imageHref(url)"
            target="_blank"
            rel="noopener noreferrer"
            class="image-link"
            :title="`Open image ${i + 1} in a new tab`"
          >
            <img :src="assetUrl(url)" :alt="`Image ${i + 1} of ${sub.images.length} from ${personName(giver)}`" loading="lazy" />
          </a>
          <div v-else class="image-link">
            <img :src="assetUrl(url)" :alt="`Image ${i + 1} of ${sub.images.length} from ${personName(giver)}`" loading="lazy" />
          </div>
        </template>
      </div>
      <p v-else class="no-images">
        <ImageOff :size="18" aria-hidden="true" /> No images, this gift is shared as a link.
      </p>

      <section v-if="links.length">
        <h3 class="text-base font-bold mb-2">Links</h3>
        <ul class="m-0 p-0 list-none flex flex-col gap-2">
          <li v-for="l in links" :key="l.href">
            <a :href="l.href" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 font-semibold">
              <ExternalLink :size="15" aria-hidden="true" />
              {{ l.label || linkHost(l.href) }}
              <span v-if="l.label" class="text-cocoa font-normal text-sm">({{ linkHost(l.href) }})</span>
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h3 class="text-base font-bold mb-2">Message to {{ personName(recipient) }}</h3>
        <p class="message">{{ sub.message || 'No message.' }}</p>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.images.single {
  grid-template-columns: minmax(0, 1fr);
}
.image-link {
  display: block;
  border-radius: 14px;
  overflow: hidden;
  background: #f3ebdc;
  border: 1px solid var(--border);
}
.image-link img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
}
.no-images {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--muted);
}
.message {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: #fbf6ec;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .images {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
