<script setup lang="ts">
/**
 * LoginView — the sign-in screen.
 *
 * Auth is qBittorrent's cookie session: POST auth/login with username and
 * password. Bad credentials come back as HTTP 200 with the body "Fails.", and
 * repeated failures cause the server to ban the IP (403 + "banned" message).
 * Both cases surface inline rather than as a generic error.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacToggle from '@/components/base/MacToggle.vue'

const { t } = useI18n()
const auth = useAuthStore()
const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const username = ref('')
const password = ref('')
const remember = ref(true)
const usernameRef = ref<InstanceType<typeof MacInput> | null>(null)

onMounted(() => {
  // Pre-fill the remembered username (never the password).
  if (auth.rememberedUsername) {
    username.value = auth.rememberedUsername
    remember.value = true
  }
})

async function onSubmit(): Promise<void> {
  if (!username.value || !password.value || auth.submitting) return

  const ok = await auth.signIn(username.value, password.value, remember.value)
  if (!ok) {
    password.value = ''
    return
  }

  toast.success(t('toast.signedIn'))
  session.start()

  // Return the user to wherever they were headed before the redirect.
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await router.replace(redirect)
}
</script>

<template>
  <div class="login">
    <div class="login__bg" aria-hidden="true" />

    <div class="login__panel glass-panel">
      <div class="login__brand">
        <span class="login__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path
              d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.2a1.4 1.4 0 011.4 1.4v5.3l3 3a1.4 1.4 0 01-2 2l-3.4-3.4a1.4 1.4 0 01-.4-1V7.6A1.4 1.4 0 0112 6.2z"
              fill="currentColor"
            />
          </svg>
        </span>
        <h1 class="login__title">{{ t('login.title') }}</h1>
        <p class="login__subtitle">{{ t('login.subtitle') }}</p>
      </div>

      <form class="login__form" @submit.prevent="onSubmit">
        <div class="login__field">
          <label class="login__label" for="login-username">{{ t('login.username') }}</label>
          <MacInput
            id="login-username"
            ref="usernameRef"
            v-model="username"
            autocomplete="username"
            :disabled="auth.submitting"
          />
        </div>

        <div class="login__field">
          <label class="login__label" for="login-password">{{ t('login.password') }}</label>
          <MacInput
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="auth.submitting"
          />
        </div>

        <MacToggle v-model="remember" :label="t('login.remember')" />

        <!-- Error region: announced to assistive tech as soon as it appears. -->
        <p v-if="auth.errorMessage" class="login__error break-anywhere" role="alert">
          {{ auth.banned ? t('login.banned') : auth.errorMessage }}
        </p>

        <MacButton
          type="submit"
          variant="primary"
          size="lg"
          block
          :loading="auth.submitting"
          :disabled="!username || !password"
        >
          {{ auth.submitting ? t('login.signingIn') : t('login.submit') }}
        </MacButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: var(--space-6);
  background: var(--bg-window);
  overflow: hidden;
}

/* Soft macOS-style wallpaper wash. Purely decorative. */
.login__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(1200px 600px at 15% 10%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 60%),
    radial-gradient(900px 500px at 85% 90%, color-mix(in srgb, var(--state-checking) 22%, transparent), transparent 60%),
    radial-gradient(700px 400px at 70% 20%, color-mix(in srgb, var(--info) 18%, transparent), transparent 65%);
  filter: blur(10px);
  pointer-events: none;
}

.login__panel {
  position: relative;
  width: 100%;
  max-width: 380px;
  padding: var(--space-8) var(--space-6);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.login__mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-md);
  margin-bottom: var(--space-2);
}

.login__title {
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-tight);
}

.login__subtitle {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.login__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.login__error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}
</style>
