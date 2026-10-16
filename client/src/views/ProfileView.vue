<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue';
import { RouterLink, onBeforeRouteLeave } from 'vue-router';
import { Save, Upload, Trash2, Loader2, AtSign, Smile, ExternalLink, Eye } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import FormField from '@/components/ui/FormField.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import TagInput from '@/components/ui/TagInput.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import ProfileHeader from '@/components/profile/ProfileHeader.vue';
import ArtistTagsEditor from '@/components/profile/ArtistTagsEditor.vue';
import { artistTagsOf } from '@shared/taste.mjs';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { prepareImage } from '@/utils/images';
import { CREATION_TYPES, LIMITS, normalizeTags } from '@shared/constants.mjs';

// Same rules as server/routes/profile-router.js
const NAME_MAX = 60;
const BIO_MAX = 1000;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const HANDLE_RE = /^[A-Za-z0-9_.-]{0,50}$/;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const SOCIALS = [
  { key: 'twitter', label: 'X / Twitter', placeholder: 'handle' },
  { key: 'instagram', label: 'Instagram', placeholder: 'handle' },
  { key: 'bluesky', label: 'Bluesky', placeholder: 'name.bsky.social' },
  { key: 'discord', label: 'Discord', placeholder: 'username' },
  { key: 'deviantart', label: 'DeviantArt', placeholder: 'username' },
  { key: 'toyhouse', label: 'Toyhou.se', placeholder: 'username' },
  { key: 'tumblr', label: 'Tumblr', placeholder: 'blog name' },
];

const cleanHandle = (value) => String(value ?? '').trim().replace(/^@+/, '');

// ---------- Public profile ----------

function profileFromUser(user) {
  return {
    displayName: user?.displayName || '',
    username: user?.username || '',
    bio: user?.bio || '',
    socials: Object.fromEntries(SOCIALS.map((s) => [s.key, user?.socials?.[s.key] || ''])),
    artistTags: artistTagsOf(user?.artistTags),
    privacy: {
      showExchanges: user?.profilePrivacy?.showExchanges !== false,
      showGifts: Boolean(user?.profilePrivacy?.showGifts),
      listInDiscover: user?.profilePrivacy?.listInDiscover !== false,
    },
  };
}

const profile = reactive(profileFromUser(auth.user));
const profileSaved = ref(JSON.stringify(profile));
const profileErrors = ref({});
const profileError = ref('');
const savingProfile = ref(false);
const profileDirty = computed(() => JSON.stringify(profile) !== profileSaved.value);

const PROFILE_IDS = {
  displayName: 'profile-display-name',
  username: 'profile-username',
  bio: 'profile-bio',
};
const socialId = (key) => `profile-social-${key}`;

function validateProfile() {
  const errors = {};
  const name = profile.displayName.trim();
  if (!name) errors.displayName = 'Display name cannot be empty.';
  else if (name.length > NAME_MAX) errors.displayName = `Keep it under ${NAME_MAX} characters.`;

  const handle = profile.username.trim().toLowerCase();
  // Very old accounts may not have a username yet; leaving it empty keeps it that way
  if (handle || auth.user?.username) {
    if (!USERNAME_RE.test(handle)) errors.username = 'Use 3-30 lowercase letters, numbers or underscores.';
  }

  if (profile.bio.trim().length > BIO_MAX) errors.bio = `Keep your bio under ${BIO_MAX} characters.`;

  for (const { key } of SOCIALS) {
    if (!HANDLE_RE.test(cleanHandle(profile.socials[key]))) {
      errors[`socials.${key}`] = 'Up to 50 letters, numbers, dots, dashes or underscores.';
    }
  }
  return errors;
}

// The server's 400 messages name the field they're about
function fieldForServerError(message = '') {
  if (message.startsWith('Usernames')) return 'username';
  if (message.startsWith('Display name')) return 'displayName';
  if (message.startsWith('Bio')) return 'bio';
  const social = /^That (\w+) handle/.exec(message);
  if (social && SOCIALS.some((s) => s.key === social[1])) return `socials.${social[1]}`;
  return null;
}

function focusField(key) {
  const id = key.startsWith('socials.') ? socialId(key.slice(8)) : PROFILE_IDS[key];
  nextTick(() => document.getElementById(id)?.focus());
}

async function saveProfile() {
  profileError.value = '';
  const errors = validateProfile();
  profileErrors.value = errors;
  const first = Object.keys(errors)[0];
  if (first) {
    focusField(first);
    return;
  }

  const body = {
    displayName: profile.displayName.trim(),
    bio: profile.bio.trim(),
    socials: Object.fromEntries(SOCIALS.map((s) => [s.key, cleanHandle(profile.socials[s.key])])),
    profilePrivacy: { ...profile.privacy },
    artistTags: { ...profile.artistTags },
  };
  const handle = profile.username.trim().toLowerCase();
  if (handle) body.username = handle;

  savingProfile.value = true;
  try {
    const { user } = await api('/profile', { method: 'PATCH', body });
    setUser(user);
    // Shows what the server kept (lowercase username, handles without "@")
    Object.assign(profile, profileFromUser(user));
    profileSaved.value = JSON.stringify(profile);
    toast.success('Profile saved.');
  } catch (e) {
    const field = e.code === 'USERNAME_TAKEN' ? 'username' : e.status === 400 ? fieldForServerError(e.message) : null;
    if (field) {
      profileErrors.value = {
        [field]: e.code === 'USERNAME_TAKEN' ? 'That username is taken. Try another one.' : e.message,
      };
      focusField(field);
    } else {
      profileError.value = e.message;
    }
  } finally {
    savingProfile.value = false;
  }
}

// ---------- Avatar ----------

const fileInput = ref(null);
const avatarBusy = ref(''); // 'upload' | 'remove' | ''
const avatarError = ref('');

async function onFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // lets the same file be picked again after an error
  if (!file) return;

  avatarError.value = '';
  avatarBusy.value = 'upload';
  try {
    // Shrinks big photos in the browser first; avatars never need more than 800px
    const image = await prepareImage(file, { maxSide: 800 });
    if (image.size > AVATAR_MAX_BYTES) throw new Error('That image is too big. Profile pictures can be up to 2 MB.');
    const form = new FormData();
    form.append('avatar', image);
    const { user } = await api('/profile/avatar', { method: 'POST', form });
    setUser(user);
    toast.success('Profile picture updated.');
  } catch (err) {
    avatarError.value = err.message || "Couldn't upload that image.";
  } finally {
    avatarBusy.value = '';
  }
}

async function removeAvatar() {
  avatarError.value = '';
  avatarBusy.value = 'remove';
  try {
    const { user } = await api('/profile/avatar', { method: 'DELETE' });
    setUser(user);
    toast.success('Profile picture removed.');
  } catch (err) {
    avatarError.value = err.message;
  } finally {
    avatarBusy.value = '';
  }
}

// ---------- Sign-up form defaults ----------

function defaultsFromUser(user) {
  const d = user?.defaultForm || {};
  return {
    communityUsername: d.communityUsername || '',
    canCreate: [...(d.canCreate || [])],
    wantsTypes: [...(d.wantsTypes || [])],
    likes: d.likes || '',
    avoid: d.avoid || '',
    cannotDraw: [...(d.cannotDraw || [])],
  };
}

const defaults = reactive(defaultsFromUser(auth.user));
const defaultsSaved = ref(JSON.stringify(defaults));
const defaultsErrors = ref({});
const defaultsError = ref('');
const savingDefaults = ref(false);
const defaultsDirty = computed(() => JSON.stringify(defaults) !== defaultsSaved.value);

const DEFAULT_IDS = {
  communityUsername: 'defaults-community',
  likes: 'defaults-likes',
  avoid: 'defaults-avoid',
  cannotDraw: 'defaults-cannot-draw',
};

function validateDefaults() {
  const errors = {};
  if (defaults.communityUsername.trim().length > LIMITS.communityUsername) {
    errors.communityUsername = `Keep this under ${LIMITS.communityUsername} characters.`;
  }
  if (defaults.likes.trim().length > LIMITS.formText) errors.likes = `Keep this under ${LIMITS.formText} characters.`;
  if (defaults.avoid.trim().length > LIMITS.formText) errors.avoid = `Keep this under ${LIMITS.formText} characters.`;
  if (defaults.cannotDraw.length > LIMITS.tags) errors.cannotDraw = `Up to ${LIMITS.tags} tags.`;
  return errors;
}

async function saveDefaults() {
  defaultsError.value = '';
  const errors = validateDefaults();
  defaultsErrors.value = errors;
  const first = Object.keys(errors)[0];
  if (first) {
    nextTick(() => document.getElementById(DEFAULT_IDS[first])?.focus());
    return;
  }

  savingDefaults.value = true;
  try {
    const { user } = await api('/profile', {
      method: 'PATCH',
      body: {
        defaultForm: {
          communityUsername: defaults.communityUsername.trim(),
          canCreate: defaults.canCreate,
          wantsTypes: defaults.wantsTypes,
          likes: defaults.likes.trim(),
          avoid: defaults.avoid.trim(),
          cannotDraw: normalizeTags(defaults.cannotDraw),
        },
      },
    });
    setUser(user);
    Object.assign(defaults, defaultsFromUser(user));
    defaultsSaved.value = JSON.stringify(defaults);
    toast.success('Sign-up defaults saved.');
  } catch (e) {
    defaultsError.value = e.message;
  } finally {
    savingDefaults.value = false;
  }
}

const count = (value) => String(value || '').length;

// ---------- Preview and leaving with unsaved changes ----------

// What visitors to /users/<username> would see with the changes typed so far
const preview = computed(() => ({
  displayName: profile.displayName.trim() || auth.user?.displayName || '',
  username: profile.username.trim().toLowerCase() || auth.user?.username || '',
  bio: profile.bio,
  socials: Object.fromEntries(SOCIALS.map((s) => [s.key, cleanHandle(profile.socials[s.key])])),
  avatarUrl: auth.user?.avatarUrl || null,
  createdAt: auth.user?.createdAt,
  artistTags: profile.artistTags,
}));
const publicLink = computed(() => (auth.user?.username ? `/users/${auth.user.username}` : ''));

const anyDirty = computed(() => profileDirty.value || defaultsDirty.value);

onBeforeRouteLeave(() => {
  if (!anyDirty.value) return true;
  return window.confirm('You have unsaved changes on your profile. Leave without saving?');
});

function onBeforeUnload(e) {
  if (anyDirty.value) e.preventDefault();
}
watch(
  anyDirty,
  (dirty) => {
    if (dirty) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  },
  { immediate: true }
);
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <div v-if="auth.user" class="profile-view">
    <PageHeader title="Your profile" subtitle="How you appear to organisers and other artists.">
      <template v-if="publicLink" #actions>
        <RouterLink :to="publicLink" class="btn btn-outline">
          <ExternalLink :size="18" aria-hidden="true" /> View public profile
        </RouterLink>
      </template>
    </PageHeader>

    <form class="card panel" novalidate aria-labelledby="profile-heading" @submit.prevent="saveProfile">
      <h2 id="profile-heading" class="section-title">Public profile</h2>
      <p class="section-sub">Your display name, username and picture show up on events you join or run.</p>

      <div class="avatar-block">
        <UserAvatar :user="auth.user" :size="88" />
        <div class="avatar-text">
          <p class="avatar-title">Profile picture</p>
          <p class="hint">PNG, JPG, WebP or GIF. Big photos are shrunk before uploading.</p>
          <div class="avatar-actions">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="Boolean(avatarBusy)"
              @click="fileInput?.click()"
            >
              <Loader2 v-if="avatarBusy === 'upload'" :size="16" class="spin" aria-hidden="true" />
              <Upload v-else :size="16" aria-hidden="true" />
              {{ avatarBusy === 'upload' ? 'Uploading…' : auth.user.avatarUrl ? 'Change picture' : 'Upload picture' }}
            </button>
            <button
              v-if="auth.user.avatarUrl"
              type="button"
              class="btn btn-ghost btn-sm btn-danger-text"
              :disabled="Boolean(avatarBusy)"
              @click="removeAvatar"
            >
              <Loader2 v-if="avatarBusy === 'remove'" :size="16" class="spin" aria-hidden="true" />
              <Trash2 v-else :size="16" aria-hidden="true" />
              Remove
            </button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onFileChosen"
          />
          <p v-if="avatarError" class="alert alert-error avatar-error" role="alert">{{ avatarError }}</p>
        </div>
      </div>

      <div class="grid-2">
        <FormField
          label="Display name"
          :for-id="PROFILE_IDS.displayName"
          :error="profileErrors.displayName"
          required
        >
          <template #default="{ describedby, invalid }">
            <div class="input-wrap">
              <Smile :size="18" class="input-icon" aria-hidden="true" />
              <input
                :id="PROFILE_IDS.displayName"
                v-model="profile.displayName"
                class="input"
                :maxlength="NAME_MAX"
                autocomplete="nickname"
                :aria-invalid="invalid ? 'true' : undefined"
                :aria-describedby="describedby"
              />
            </div>
          </template>
        </FormField>

        <FormField
          label="Username"
          :for-id="PROFILE_IDS.username"
          :error="profileErrors.username"
          hint="3-30 lowercase letters, numbers or underscores."
        >
          <template #default="{ describedby, invalid }">
            <div class="input-wrap">
              <AtSign :size="18" class="input-icon" aria-hidden="true" />
              <input
                :id="PROFILE_IDS.username"
                v-model="profile.username"
                class="input"
                maxlength="30"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                :aria-invalid="invalid ? 'true' : undefined"
                :aria-describedby="describedby"
                @blur="profile.username = profile.username.trim().toLowerCase()"
              />
            </div>
          </template>
        </FormField>
      </div>

      <FormField label="Bio" :for-id="PROFILE_IDS.bio" :error="profileErrors.bio" class="spaced">
        <template #aside>
          <span class="hint">{{ count(profile.bio) }}/{{ BIO_MAX }}</span>
        </template>
        <template #default="{ describedby, invalid }">
          <div class="input-wrap">
            <textarea
              :id="PROFILE_IDS.bio"
              v-model="profile.bio"
              class="textarea"
              rows="4"
              :maxlength="BIO_MAX"
              placeholder="What do you like to draw? Which communities are you part of?"
              :aria-invalid="invalid ? 'true' : undefined"
              :aria-describedby="describedby"
            />
          </div>
        </template>
      </FormField>

      <fieldset class="socials">
        <legend class="label">Social links</legend>
        <p class="hint socials-hint">Just the handle, without the @. Leave any you don't use empty.</p>
        <div class="socials-grid">
          <FormField
            v-for="s in SOCIALS"
            :key="s.key"
            :label="s.label"
            :for-id="socialId(s.key)"
            :error="profileErrors[`socials.${s.key}`]"
          >
            <template #default="{ describedby, invalid }">
              <div class="input-wrap">
                <span class="at" aria-hidden="true">@</span>
                <input
                  :id="socialId(s.key)"
                  v-model="profile.socials[s.key]"
                  class="input"
                  maxlength="51"
                  autocapitalize="none"
                  spellcheck="false"
                  :placeholder="s.placeholder"
                  :aria-invalid="invalid ? 'true' : undefined"
                  :aria-describedby="describedby"
                />
              </div>
            </template>
          </FormField>
        </div>
      </fieldset>

      <fieldset class="artist-tags">
        <legend class="label">Your artist tags</legend>
        <p class="hint tags-hint">
          Shown on your profile and on Discover so people who like the same things can find you. Not sure?
          <RouterLink to="/find-your-style">Take the Find your style quiz</RouterLink>.
        </p>
        <ArtistTagsEditor v-model="profile.artistTags" />
      </fieldset>

      <fieldset class="privacy">
        <legend class="label">What your public profile shows</legend>
        <div class="privacy-row">
          <label class="switch" for="privacy-exchanges">
            <input
              id="privacy-exchanges"
              v-model="profile.privacy.showExchanges"
              type="checkbox"
              role="switch"
              aria-describedby="privacy-exchanges-hint"
            />
            <span class="track" aria-hidden="true"><span class="thumb" /></span>
            <span class="switch-label">Show exchanges I've joined on my profile</span>
          </label>
          <p id="privacy-exchanges-hint" class="hint">
            Finished public exchanges you took part in, and how many. Private events are never listed.
          </p>
        </div>
        <div class="privacy-row">
          <label class="switch" for="privacy-discover">
            <input
              id="privacy-discover"
              v-model="profile.privacy.listInDiscover"
              type="checkbox"
              role="switch"
              aria-describedby="privacy-discover-hint"
            />
            <span class="track" aria-hidden="true"><span class="thumb" /></span>
            <span class="switch-label">List me in Discover</span>
          </label>
          <p id="privacy-discover-hint" class="hint">
            Lets people find you by name or by the things you love. Turned off, your profile still works for anyone
            with the link.
          </p>
        </div>
        <div class="privacy-row">
          <label class="switch" for="privacy-gifts">
            <input
              id="privacy-gifts"
              v-model="profile.privacy.showGifts"
              type="checkbox"
              role="switch"
              aria-describedby="privacy-gifts-hint"
            />
            <span class="track" aria-hidden="true"><span class="thumb" /></span>
            <span class="switch-label">Allow public display of gifts I made or received</span>
          </label>
          <p id="privacy-gifts-hint" class="hint">
            A gift only appears on its artist's profile when both the artist and the person it was made for allow it.
            Turning this off hides those gifts straight away.
          </p>
        </div>
      </fieldset>

      <p v-if="profileError" class="alert alert-error form-alert" role="alert">{{ profileError }}</p>

      <div class="actions">
        <span v-if="profileDirty" class="unsaved">Unsaved changes</span>
        <button type="submit" class="btn btn-primary" :disabled="savingProfile">
          <Loader2 v-if="savingProfile" :size="18" class="spin" aria-hidden="true" />
          <Save v-else :size="18" aria-hidden="true" />
          Save profile
        </button>
      </div>
    </form>

    <section class="preview" aria-labelledby="preview-heading">
      <h2 id="preview-heading" class="preview-title"><Eye :size="18" aria-hidden="true" /> Preview</h2>
      <p class="preview-sub">
        How your public profile looks with the changes above<template v-if="profileDirty"> (not saved yet)</template>.
        Your email, characters and sign-up forms are never shown there.
      </p>
      <p class="preview-sub">
        {{ profile.privacy.showExchanges ? 'Exchanges you joined are listed.' : 'Exchanges you joined are hidden.' }}
        {{
          profile.privacy.showGifts
            ? 'Gifts you made show up once their recipient allows it too.'
            : "Gifts you made aren't shown."
        }}
      </p>
      <ProfileHeader :profile="preview" heading-tag="h3" />
    </section>

    <form class="card panel" novalidate aria-labelledby="defaults-heading" @submit.prevent="saveDefaults">
      <h2 id="defaults-heading" class="section-title">Sign-up form defaults</h2>
      <p class="section-sub">
        We fill these in for you whenever you sign up for an event. You can still change them for each event.
      </p>

      <FormField
        label="Community username"
        :for-id="DEFAULT_IDS.communityUsername"
        :error="defaultsErrors.communityUsername"
        hint="The name organisers know you by, e.g. your Discord or DeviantArt username."
      >
        <template #default="{ describedby, invalid }">
          <div class="input-wrap">
            <input
              :id="DEFAULT_IDS.communityUsername"
              v-model="defaults.communityUsername"
              class="input"
              :maxlength="LIMITS.communityUsername"
              autocapitalize="none"
              spellcheck="false"
              :aria-invalid="invalid ? 'true' : undefined"
              :aria-describedby="describedby"
            />
          </div>
        </template>
      </FormField>

      <div class="grid-2 spaced">
        <FormField label="What you can make" for-id="defaults-can-create" group>
          <ChoiceChips
            v-model="defaults.canCreate"
            :options="CREATION_TYPES"
            aria-labelledby="defaults-can-create-label"
          />
        </FormField>
        <FormField label="What you'd like to receive" for-id="defaults-wants" group>
          <ChoiceChips v-model="defaults.wantsTypes" :options="CREATION_TYPES" aria-labelledby="defaults-wants-label" />
        </FormField>
      </div>

      <div class="grid-2 spaced">
        <FormField label="Things you'd love to get" :for-id="DEFAULT_IDS.likes" :error="defaultsErrors.likes">
          <template #aside>
            <span class="hint">{{ count(defaults.likes) }}/{{ LIMITS.formText }}</span>
          </template>
          <template #default="{ describedby, invalid }">
            <div class="input-wrap">
              <textarea
                :id="DEFAULT_IDS.likes"
                v-model="defaults.likes"
                class="textarea short"
                rows="3"
                :maxlength="LIMITS.formText"
                placeholder="Cosy scenes, soft colours, my moth OC…"
                :aria-invalid="invalid ? 'true' : undefined"
                :aria-describedby="describedby"
              />
            </div>
          </template>
        </FormField>
        <FormField label="Things to avoid" :for-id="DEFAULT_IDS.avoid" :error="defaultsErrors.avoid">
          <template #aside>
            <span class="hint">{{ count(defaults.avoid) }}/{{ LIMITS.formText }}</span>
          </template>
          <template #default="{ describedby, invalid }">
            <div class="input-wrap">
              <textarea
                :id="DEFAULT_IDS.avoid"
                v-model="defaults.avoid"
                class="textarea short"
                rows="3"
                :maxlength="LIMITS.formText"
                placeholder="Anything you'd rather not receive"
                :aria-invalid="invalid ? 'true' : undefined"
                :aria-describedby="describedby"
              />
            </div>
          </template>
        </FormField>
      </div>

      <FormField
        label="Things you can't draw"
        :for-id="DEFAULT_IDS.cannotDraw"
        :error="defaultsErrors.cannotDraw"
        hint="Species or tags, e.g. mecha, horses. You won't be matched with characters that have them."
        class="spaced"
      >
        <template #default="{ describedby }">
          <TagInput
            :id="DEFAULT_IDS.cannotDraw"
            v-model="defaults.cannotDraw"
            :max="LIMITS.tags"
            placeholder="Type and press Enter"
            :aria-describedby="describedby"
          />
        </template>
      </FormField>

      <p v-if="defaultsError" class="alert alert-error form-alert" role="alert">{{ defaultsError }}</p>

      <div class="actions">
        <span v-if="defaultsDirty" class="unsaved">Unsaved changes</span>
        <button type="submit" class="btn btn-primary" :disabled="savingDefaults">
          <Loader2 v-if="savingDefaults" :size="18" class="spin" aria-hidden="true" />
          <Save v-else :size="18" aria-hidden="true" />
          Save defaults
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.profile-view :deep(.page-header) {
  margin-bottom: 4px;
}
.panel {
  padding: 32px;
}
.section-sub {
  margin-bottom: 26px;
}
.avatar-block {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 26px;
  margin-bottom: 26px;
  border-bottom: 1px solid var(--border);
}
.avatar-text {
  min-width: 0;
  flex: 1;
}
.avatar-title {
  margin: 0;
  font-weight: 600;
}
.avatar-text .hint {
  margin: 4px 0 0;
}
.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.avatar-error {
  margin: 12px 0 0;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
.grid-2 > .field + .field {
  margin-top: 0;
}
.spaced {
  margin-top: 22px;
}
.textarea {
  min-height: 110px;
}
.textarea.short {
  min-height: 96px;
}
.socials {
  border: 0;
  margin: 26px 0 0;
  padding: 0;
  min-width: 0;
}
.socials legend {
  padding: 0;
}
.socials-hint {
  margin: 4px 0 14px;
}
.socials-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 22px;
}
.socials-grid > .field + .field {
  margin-top: 0;
}
.at {
  color: var(--muted);
  font-weight: 600;
}
.form-alert {
  margin: 22px 0 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 28px;
}
.artist-tags {
  border: 0;
  margin: 26px 0 0;
  padding: 0;
  min-width: 0;
}
.tags-hint {
  margin: 0 0 14px;
}
.privacy {
  border: 0;
  margin: 24px 0 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.privacy-row .hint {
  margin: 4px 0 0 54px;
}
/* Same switch as the event form's settings */
.switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  position: relative;
  width: fit-content;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.switch-label {
  font-weight: 600;
}
.track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: var(--border-strong);
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s;
}
.switch input:checked + .track {
  background: var(--pink);
}
.switch input:checked + .track .thumb {
  transform: translateX(18px);
}
.switch input:focus-visible + .track {
  box-shadow: var(--focus-ring);
}
.unsaved {
  color: var(--muted);
  font-size: 0.92rem;
  font-weight: 600;
}
.preview-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.15rem;
}
.preview-sub {
  margin: 4px 0 14px;
  color: var(--muted);
  font-size: 0.92rem;
}

@media (max-width: 640px) {
  .panel {
    padding: 24px 18px;
  }
  .avatar-block {
    gap: 16px;
  }
  .avatar-block :deep(.avatar) {
    width: 64px !important;
    height: 64px !important;
    font-size: 23px !important;
  }
  .grid-2,
  .socials-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .actions .btn {
    width: 100%;
  }
  .unsaved {
    width: 100%;
    text-align: center;
  }
}
</style>
