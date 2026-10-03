<script setup lang="ts">
/**
 * CredentialsPanel — change the WebUI username and password.
 *
 * Deliberately NOT part of the schema-driven form:
 *
 *  - `web_ui_password` is write-only. The API never returns it (only a hash),
 *    so it can never participate in dirty-tracking. A schema field would show
 *    as permanently pending.
 *  - Changing credentials can lock you out. That deserves a confirmation step
 *    and a clear success/failure signal, not a "Save" button shared with
 *    unrelated preferences.
 *  - The password must be typed twice. A typo here means being locked out of
 *    the WebUI until you can edit the config file inside the container.
 *
 * The server stores only a PBKDF2 hash, so we send the plaintext over the same
 * channel the login form uses. That means this is only safe over HTTPS — which
 * is why the panel says so when the page is not secure.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPreferences, setPreferences } from '@/api/app'
import { useToast, describeError } from '@/composables/useToast'
import MacCard from '@/components/base/MacCard.vue'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacBadge from '@/components/base/MacBadge.vue'

const props = defineProps<{
  /** Current username, loaded by the parent preferences fetch. */
  currentUsername: string
}>()

const emit = defineEmits<{ (e: 'changed', username: string): void }>()

const { t } = useI18n()
const toast = useToast()

const username = ref(props.currentUsername)
const password = ref('')
const confirm = ref('')
const saving = ref(false)
const error = ref('')

/** Passwords are only safe to send over a secure connection (or localhost). */
const isSecure = computed(
  () =>
    typeof window === 'undefined' ||
    window.location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname),
)

const usernameChanged = computed(() => username.value !== props.currentUsername)
const passwordEntered = computed(() => password.value.length > 0)

const canSave = computed(
  () =>
    !saving.value &&
    (usernameChanged.value || passwordEntered.value) &&
    username.value.trim().length > 0 &&
    (!passwordEntered.value || password.value === confirm.value),
)

const mismatch = computed(
  () => passwordEntered.value && confirm.value.length > 0 && password.value !== confirm.value,
)

function reset(): void {
  username.value = props.currentUsername
  password.value = ''
  confirm.value = ''
  error.value = ''
}

async function save(): Promise<void> {
  if (!canSave.value) return
  error.value = ''
  saving.value = true

  try {
    const patch: Record<string, string> = {}

    if (usernameChanged.value) {
      const next = username.value.trim()
      if (!next) {
        error.value = t('credentials.usernameRequired')
        return
      }
      patch.web_ui_username = next
    }

    if (passwordEntered.value) {
      if (password.value !== confirm.value) {
        error.value = t('credentials.mismatch')
        return
      }
      // Sent as plaintext; the server hashes it with PBKDF2 before storing.
      patch.web_ui_password = password.value
    }

    await setPreferences(patch as never)

    // Re-read to confirm the server actually accepted the change. A silent
    // no-op here would otherwise look like success.
    const after = await getPreferences()
    const applied = String((after as Record<string, unknown>).web_ui_username ?? '')

    if (patch.web_ui_username && applied !== patch.web_ui_username) {
      error.value = t('credentials.notApplied')
      return
    }

    password.value = ''
    confirm.value = ''
    emit('changed', applied || props.currentUsername)
    toast.success(t('credentials.saved'))
  } catch (err) {
    error.value = describeError(err)
    toast.error(error.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <MacCard padding="md">
    <div class="cred__head">
      <h2 class="cred__title">{{ t('credentials.title') }}</h2>
      <MacBadge v-if="!isSecure" tone="warning" size="sm">{{ t('credentials.insecure') }}</MacBadge>
    </div>

    <p class="cred__hint">
      {{ isSecure ? t('credentials.hint') : t('credentials.insecureHint') }}
    </p>

    <div class="cred__grid">
      <label class="cred__field cred__field--wide">
        <span class="cred__label">{{ t('credentials.username') }}</span>
        <MacInput v-model="username" autocomplete="username" autocapitalize="none" spellcheck="false" />
      </label>

      <label class="cred__field">
        <span class="cred__label">{{ t('credentials.newPassword') }}</span>
        <MacInput
          v-model="password"
          type="password"
          autocomplete="new-password"
          :placeholder="t('credentials.unchanged')"
        />
      </label>

      <label class="cred__field">
        <span class="cred__label">{{ t('credentials.confirmPassword') }}</span>
        <MacInput v-model="confirm" type="password" autocomplete="new-password" />
      </label>
    </div>

    <p v-if="mismatch" class="cred__error" role="alert">{{ t('credentials.mismatch') }}</p>
    <p v-else-if="error" class="cred__error break-anywhere" role="alert">{{ error }}</p>

    <div class="cred__actions">
      <MacButton
        variant="secondary"
        :disabled="(!usernameChanged && !passwordEntered) || saving"
        @click="reset"
      >
        {{ t('action.cancel') }}
      </MacButton>
      <MacButton variant="primary" :disabled="!canSave" :loading="saving" @click="save">
        {{ t('credentials.save') }}
      </MacButton>
    </div>
  </MacCard>
</template>

<style scoped>
.cred__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.cred__title {
  font-size: var(--text-md);
  font-weight: 600;
}

.cred__hint {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
  overflow-wrap: anywhere;
}

.cred__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.cred__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.cred__field--wide {
  grid-column: 1 / -1;
}

.cred__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.cred__error {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.cred__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

@media (max-width: 599px) {
  .cred__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
}
</style>