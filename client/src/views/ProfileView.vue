<script setup>
import { ref, reactive, computed } from 'vue';
import { Save, Upload, Trash2, Loader2, Check } from 'lucide-vue-next';
import UserAvatar from '../components/UserAvatar.vue';
import { auth, setUser } from '../stores/auth';
import { api } from '../api';

const BIO_MAX = 1000;

const form = reactive({
  displayName: auth.user.displayName,
  bio: auth.user.bio,
  socials: { ...auth.user.socials },
});

const saving = ref(false);
const saved = ref(false);
const error = ref('');

const uploading = ref(false);
const avatarError = ref('');
const fileInput = ref(null);

const bioCount = computed(() => form.bio.length);

async function save() {
  error.value = '';
  saved.value = false;
  if (!form.displayName.trim()) {
    error.value = 'Display name cannot be empty.';
    return;
  }

  saving.value = true;
  try {
    const { user } = await api('/profile', { method: 'PATCH', body: form });
    setUser(user);
    form.socials = { ...user.socials }; // shows handles without the "@" the server stripped
    saved.value = true;
    setTimeout(() => (saved.value = false), 2500);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function onFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // allow choosing the same file again later
  if (!file) return;

  avatarError.value = '';
  if (file.size > 2 * 1024 * 1024) {
    avatarError.value = 'That image is too big. Max 2 MB.';
    return;
  }

  const data = new FormData();
  data.append('avatar', file);
  uploading.value = true;
  try {
    const { user } = await api('/profile/avatar', { method: 'POST', form: data });
    setUser(user);
  } catch (err) {
    avatarError.value = err.message;
  } finally {
    uploading.value = false;
  }
}

async function removeAvatar() {
  avatarError.value = '';
  try {
    const { user } = await api('/profile/avatar', { method: 'DELETE' });
    setUser(user);
  } catch (err) {
    avatarError.value = err.message;
  }
}
</script>

<template>
  <main v-if="auth.user" class="page">
    <header class="profile-head">
      <UserAvatar :user="auth.user" :size="128" />
      <div>
        <h1>Your profile</h1>
        <p class="email">{{ auth.user.email }}</p>
      </div>
    </header>

    <form class="card profile-card" novalidate @submit.prevent="save">
      <h2 class="section-title">Artist details</h2>
      <p class="section-sub">How you appear to organizers and other participants.</p>

      <div class="field">
        <span class="label">Profile picture</span>
        <div class="avatar-row">
          <UserAvatar :user="auth.user" :size="64" />
          <div class="avatar-actions">
            <button type="button" class="btn btn-outline small" :disabled="uploading" @click="fileInput.click()">
              <Loader2 v-if="uploading" :size="16" class="spin" />
              <Upload v-else :size="16" />
              {{ uploading ? 'Uploading…' : 'Upload image' }}
            </button>
            <button v-if="auth.user.avatarUrl" type="button" class="btn btn-ghost small" @click="removeAvatar">
              <Trash2 :size="16" /> Remove
            </button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            @change="onFileChosen"
          />
        </div>
        <span class="hint">PNG, JPG, WebP or GIF, up to 2 MB.</span>
        <p v-if="avatarError" class="alert alert-error">{{ avatarError }}</p>
      </div>

      <div class="field">
        <label for="displayName" class="label">Display name</label>
        <div class="input-wrap">
          <input id="displayName" v-model="form.displayName" class="input" maxlength="60" autocomplete="nickname" />
        </div>
      </div>

      <div class="field">
        <div class="field-head">
          <label for="bio" class="label">Bio</label>
          <span class="hint">{{ bioCount }}/{{ BIO_MAX }}</span>
        </div>
        <div class="input-wrap">
          <textarea
            id="bio"
            v-model="form.bio"
            class="textarea"
            :maxlength="BIO_MAX"
            placeholder="Tell organizers about your art…"
          />
        </div>
      </div>

      <div class="socials">
        <div class="field">
          <label for="twitter" class="label">Twitter / X</label>
          <div class="input-wrap">
            <input id="twitter" v-model="form.socials.twitter" class="input" placeholder="@handle" maxlength="51" />
          </div>
        </div>
        <div class="field">
          <label for="instagram" class="label">Instagram</label>
          <div class="input-wrap">
            <input id="instagram" v-model="form.socials.instagram" class="input" placeholder="@handle" maxlength="51" />
          </div>
        </div>
        <div class="field">
          <label for="bluesky" class="label">Bluesky</label>
          <div class="input-wrap">
            <input id="bluesky" v-model="form.socials.bluesky" class="input" placeholder="@handle" maxlength="51" />
          </div>
        </div>
      </div>

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <div class="actions">
        <span v-if="saved" class="saved"><Check :size="18" /> Saved</span>
        <button class="btn btn-primary" :disabled="saving">
          <Loader2 v-if="saving" :size="20" class="spin" />
          <Save v-else :size="20" />
          Save profile
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.profile-head {
  display: flex;
  align-items: center;
  gap: 32px;
}
.profile-head h1 {
  font-size: clamp(1.9rem, 4vw, 2.4rem);
  font-weight: 800;
}
.email {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 1.15rem;
  word-break: break-all;
}
.profile-card {
  max-width: 900px;
  margin-top: 44px;
  padding: 44px 48px;
}
.section-title {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1.45rem;
}
.section-sub {
  margin: 8px 0 34px;
  color: var(--muted);
  font-size: 1.1rem;
}
.field {
  margin-top: 26px;
}
.section-sub + .field {
  margin-top: 0;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 18px;
}
.avatar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.small {
  padding: 9px 14px;
  font-size: 0.92rem;
  gap: 8px;
}
.socials {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
  margin-top: 26px;
}
.socials .field {
  margin-top: 0;
  min-width: 0;
}
.alert {
  margin: 22px 0 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
}
.actions .btn {
  font-size: 1.15rem;
  padding: 14px 26px;
}
.saved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-weight: 600;
}
@media (max-width: 760px) {
  .profile-head {
    gap: 18px;
  }
  .profile-head :deep(.avatar) {
    width: 80px !important;
    height: 80px !important;
    font-size: 28px !important;
  }
  .profile-card {
    padding: 28px 20px;
    margin-top: 28px;
  }
  .socials {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .socials .field {
    margin-top: 22px;
  }
  .actions .btn {
    width: 100%;
  }
}
</style>
