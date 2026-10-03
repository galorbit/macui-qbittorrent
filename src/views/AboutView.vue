<script setup lang="ts">
/**
 * AboutView — versions and build information.
 *
 * Distinguishes the server's qBittorrent version from this WebUI's own
 * version, because a mismatch is the first thing to check when something looks
 * wrong after an image upgrade.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBuildInfo, getWebApiVersion } from '@/api/app'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import type { BuildInfo } from '@/types/api'
import MacCard from '@/components/base/MacCard.vue'
import MacBadge from '@/components/base/MacBadge.vue'

const { t } = useI18n()
const auth = useAuthStore()
const theme = useTheme()

const build = ref<BuildInfo | null>(null)
const webApiVersion = ref('')

/** Version of this WebUI itself, injected at build time. */
const webuiVersion = __APP_VERSION__

onMounted(async () => {
  try {
    build.value = await getBuildInfo()
  } catch {
    /* cosmetic — leave blank */
  }
  try {
    webApiVersion.value = await getWebApiVersion()
  } catch {
    /* cosmetic */
  }
})

const buildRows = computed(() => {
  const b = build.value
  if (!b) return []
  return [
    { label: t('about.platform'), value: b.platform },
    { label: t('about.qt'), value: b.qt },
    { label: t('about.libtorrent'), value: b.libtorrent },
    { label: t('about.boost'), value: b.boost },
    { label: t('about.openssl'), value: b.openssl },
    { label: t('about.zlib'), value: b.zlib },
    { label: t('about.bitness'), value: `${b.bitness}-bit` },
  ]
})
</script>

<template>
  <div class="about">
    <header class="about__hero">
      <span class="about__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="34" height="34">
          <path
            d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.2a1.4 1.4 0 011.4 1.4v5.3l3 3a1.4 1.4 0 01-2 2l-3.4-3.4a1.4 1.4 0 01-.4-1V7.6A1.4 1.4 0 0112 6.2z"
            fill="currentColor"
          />
        </svg>
      </span>
      <h1 class="about__title">MacUI for qBittorrent</h1>
      <p class="about__credits">{{ t('about.credits') }}</p>
      <div class="about__badges">
        <MacBadge tone="accent" size="md">{{ t('about.webui') }} {{ webuiVersion }}</MacBadge>
        <MacBadge tone="info" size="md">
          {{ t('about.qbittorrent') }} {{ auth.displayVersion }}
        </MacBadge>
      </div>
    </header>

    <MacCard padding="md">
      <h2 class="about__section">{{ t('detail.information') }}</h2>
      <dl class="about__rows">
        <div class="about__row">
          <dt>{{ t('about.webui') }}</dt>
          <dd>{{ webuiVersion }}</dd>
        </div>
        <div class="about__row">
          <dt>{{ t('about.qbittorrent') }}</dt>
          <dd>{{ auth.displayVersion }}</dd>
        </div>
        <div class="about__row">
          <dt>WebAPI</dt>
          <dd>{{ webApiVersion || '—' }}</dd>
        </div>
        <div class="about__row">
          <dt>{{ t('theme.label') }}</dt>
          <dd>{{ t(`theme.${theme.preference.value}`) }}</dd>
        </div>
      </dl>
    </MacCard>

    <MacCard v-if="buildRows.length" padding="md">
      <h2 class="about__section">{{ t('about.build') }}</h2>
      <dl class="about__rows">
        <div v-for="row in buildRows" :key="row.label" class="about__row">
          <dt>{{ row.label }}</dt>
          <dd class="break-anywhere">{{ row.value }}</dd>
        </div>
      </dl>
    </MacCard>
  </div>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.about__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-4) 0;
}

.about__mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-xl);
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-md);
  margin-bottom: var(--space-2);
}

.about__title {
  font-size: var(--text-xl);
  font-weight: 600;
}

.about__credits {
  font-size: var(--text-base);
  color: var(--text-secondary);
  max-width: 44ch;
}

.about__badges {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: center;
  margin-top: var(--space-2);
}

.about__section {
  font-size: var(--text-md);
  font-weight: 600;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--separator);
}

.about__rows {
  display: flex;
  flex-direction: column;
}

.about__row {
  display: grid;
  grid-template-columns: minmax(110px, 190px) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--separator);
  min-width: 0;
}

.about__row:last-child {
  border-bottom: none;
}

.about__row dt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.about__row dd {
  margin: 0;
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  min-width: 0;
}

@media (max-width: 599px) {
  .about {
    padding: var(--space-3);
  }

  .about__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
  }
}
</style>