<script setup lang="ts">
/**
 * ConnectionPanel — connectivity and cumulative-transfer statistics.
 *
 * Mirrors what the stock WebUI shows in its status bar, which the WebUI-only
 * user needs to answer two questions:
 *
 *   1. Can other peers reach me? (firewall / port-forwarding state)
 *   2. What have I moved in total, and is DHT healthy?
 *
 * Reachability is derived from `connection_status`, whose meaning comes
 * straight from the server (synccontroller.cpp):
 *
 *   connected     listening AND peers have connected to us
 *   firewalled    listening but NO incoming connections — nothing reaches us
 *   disconnected  not listening at all
 *
 * "firewalled" is the important one: downloads may still work, but uploads and
 * peer discovery are degraded, and the usual cause is a closed port or missing
 * port forwarding. So it gets an explanatory hint rather than just a label.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { formatBytes } from '@/utils/format'
import MacCard from '@/components/base/MacCard.vue'
import MacBadge from '@/components/base/MacBadge.vue'

const props = withDefaults(
  defineProps<{
    /**
     * Sidebar presentation: a compact block without its own card chrome, since
     * the sidebar already supplies the surface. Rows stack into a single column
     * and only the essential statistics are kept.
     */
    compact?: boolean
  }>(),
  { compact: false },
)

const { t } = useI18n()
const session = useSessionStore()

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const statusTone = computed<Tone>(() => {
  if (!session.connected) return 'danger'
  switch (session.connectionStatus) {
    case 'connected':
      return 'success'
    case 'firewalled':
      return 'warning'
    case 'disconnected':
      return 'danger'
    default:
      return 'neutral'
  }
})

const statusLabel = computed(() => {
  if (!session.connected) return t('status.offline')
  switch (session.connectionStatus) {
    case 'connected':
      return t('connectivity.reachable')
    case 'firewalled':
      return t('connectivity.firewalled')
    case 'disconnected':
      return t('status.disconnected')
    default:
      return t('connectivity.unknown')
  }
})

/** Shown under the status badge, explaining what to do about it. */
const statusHint = computed(() => {
  // Nothing to say when everything works. A permanent "port forwarding is
  // fine" banner is pure noise: it occupies the scarcest space in the sidebar
  // to report the absence of a problem, and it is what the user reads past
  // every single time. Only a PROBLEM earns a line here.
  if (props.compact) {
    if (!session.connected) return t('connectivity.offlineShort')
    switch (session.connectionStatus) {
      case 'firewalled':
        return t('connectivity.firewalledShort')
      case 'disconnected':
        return t('connectivity.disconnectedShort')
      default:
        return ''
    }
  }

  if (!session.connected) return t('connectivity.offlineHint')
  switch (session.connectionStatus) {
    case 'connected':
      return t('connectivity.reachableHint')
    case 'firewalled':
      return t('connectivity.firewalledHint')
    case 'disconnected':
      return t('connectivity.disconnectedHint')
    default:
      return ''
  }
})

/** The long-form explanation, offered as a tooltip when compact. */
const fullHint = computed(() => {
  if (!session.connected) return t('connectivity.offlineHint')
  switch (session.connectionStatus) {
    case 'connected':
      return t('connectivity.reachableHint')
    case 'firewalled':
      return t('connectivity.firewalledHint')
    case 'disconnected':
      return t('connectivity.disconnectedHint')
    default:
      return ''
  }
})

/** DHT only reports nodes when it is enabled; hide the row when it is off. */
const showDht = computed(() => session.dhtNodes > 0)

const rows = computed(() => {
  const list: Array<{ label: string; value: string; title?: string }> = []

  if (props.compact) {
    // The sidebar has little room, so only the numbers a user actually glances
    // at: cumulative totals, ratio, and DHT health.
    list.push(
      { label: t('stats.allTimeDownloaded'), value: formatBytes(session.allTimeDownloaded) },
      { label: t('stats.allTimeUploaded'), value: formatBytes(session.allTimeUploaded) },
      { label: t('stats.allTimeRatio'), value: String(session.globalRatio) },
    )
    if (showDht.value) {
      list.push({
        label: t('stats.dhtNodes'),
        value: session.dhtNodes.toLocaleString(),
        title: t('stats.dhtNodesHint'),
      })
    }
    return list
  }

  list.push(
    {
      label: t('stats.allTimeDownloaded'),
      value: formatBytes(session.allTimeDownloaded),
    },
    {
      label: t('stats.allTimeUploaded'),
      value: formatBytes(session.allTimeUploaded),
    },
    {
      label: t('stats.allTimeRatio'),
      value: String(session.globalRatio),
    },
    {
      label: t('stats.sessionDownloaded'),
      value: formatBytes(session.sessionDownloaded),
    },
    {
      label: t('stats.sessionUploaded'),
      value: formatBytes(session.sessionUploaded),
    },
  )

  if (showDht.value) {
    list.push({
      label: t('stats.dhtNodes'),
      value: session.dhtNodes.toLocaleString(),
      title: t('stats.dhtNodesHint'),
    })
  }

  if (session.peerConnections > 0) {
    list.push({
      label: t('stats.peerConnections'),
      value: session.peerConnections.toLocaleString(),
    })
  }

  if (session.externalAddress) {
    list.push({
      label: t('stats.externalAddress'),
      value: session.externalAddress,
      title: t('stats.externalAddressHint'),
    })
  }

  return list
})
</script>

<template>
  <!-- Compact mode drops the card entirely: the sidebar is already a surface,
       and nesting a card inside it would double the borders. -->
  <component
    :is="compact ? 'div' : MacCard"
    v-bind="compact ? {} : { glass: true, padding: 'md' }"
    class="conn"
    :class="{ 'conn--compact': compact }"
  >
    <div class="conn__head">
      <h2 class="conn__title">{{ compact ? t('connectivity.shortTitle') : t('connectivity.title') }}</h2>
      <MacBadge :tone="statusTone" :size="compact ? 'sm' : 'md'" dot>{{ statusLabel }}</MacBadge>
    </div>

    <p
      v-if="statusHint"
      class="conn__hint"
      :class="`conn__hint--${statusTone}`"
      :title="compact ? fullHint : undefined"
    >
      {{ statusHint }}
    </p>

    <dl class="conn__rows">
      <div v-for="row in rows" :key="row.label" class="conn__row">
        <dt class="conn__label" :title="row.title">{{ row.label }}</dt>
        <dd class="conn__value" :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>
  </component>
</template>

<style scoped>
.conn {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.conn__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.conn__title {
  font-size: var(--text-md);
  font-weight: 600;
}

.conn__hint {
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  overflow-wrap: anywhere;
}

.conn__hint--success {
  background: var(--success-soft);
  color: var(--success);
}

.conn__hint--warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.conn__hint--danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.conn__hint--neutral {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.conn__rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
  margin: 0;
  min-width: 0;
}

.conn__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--separator);
}

.conn__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn__value {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 599px) {
  .conn__rows {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---- Compact (sidebar) ----
   One row per statistic, tighter type, and the hint trimmed to two lines so it
   cannot dominate the column. */
.conn--compact {
  gap: var(--space-2);
}

.conn--compact .conn__head {
  gap: var(--space-2);
}

.conn--compact .conn__title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.conn--compact .conn__hint {
  font-size: var(--text-xs);
  line-height: 1.4;
  padding: var(--space-1) var(--space-2);
  /* Hard two-line ceiling: the column is narrow and this block must never
     grow enough to push the speed readout off screen. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.conn--compact .conn__rows {
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.conn--compact .conn__row {
  padding-bottom: 2px;
}

.conn--compact .conn__value {
  font-size: var(--text-xs);
}
</style>