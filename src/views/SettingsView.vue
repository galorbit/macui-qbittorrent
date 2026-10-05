<script setup lang="ts">
/**
 * SettingsView — the full preferences editor.
 *
 * Coverage: every preference group the stock qBittorrent WebUI exposes
 * (Behaviour, Downloads, Connection, Speed, BitTorrent, RSS, WebUI, Advanced).
 *
 * Design notes
 * ------------
 * - The form is generated from `src/config/settings-schema.ts`, so adding a
 *   preference is a schema change rather than new markup.
 * - Only CHANGED keys are sent, so saving can never clobber a setting this UI
 *   does not model, nor one another admin changed in the meantime.
 * - Search filters across group names and field labels, which matters at
 *   ~150 fields.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPreferences, setPreferences } from '@/api/app'
import { useToast, describeError } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { allFields, fromApi, groups, toApi, type SettingField } from '@/config/settings-schema'
import MacButton from '@/components/base/MacButton.vue'
import MacInput from '@/components/base/MacInput.vue'
import MacSpinner from '@/components/base/MacSpinner.vue'
import MacBadge from '@/components/base/MacBadge.vue'
import SettingFieldControl from '@/components/settings/SettingFieldControl.vue'
import CredentialsPanel from '@/components/settings/CredentialsPanel.vue'
import { sectionLayout, sectionsForGroup } from '@/config/settings-sections'

const { t } = useI18n()
const toast = useToast()
const session = useSessionStore()

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const searchQuery = ref('')
const activeGroup = ref<string>(groups[0]?.id ?? '')

/** Raw snapshot as returned by the API, kept for diffing. */
/** Current WebUI username, shown by the credentials panel. */
const currentUsername = ref('')

const snapshot = ref<Record<string, unknown>>({})
/** Editable values, converted for display. */
const draft = ref<Record<string, unknown>>({})

// ---------------------------------------------------------------------------
// Labels — shared with the renderer so search can match what the user sees.
// ---------------------------------------------------------------------------
function prettify(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function fieldLabel(field: SettingField): string {
  const key = `settings.field.${field.key}`
  const translated = t(key)
  return translated === key ? prettify(field.key) : translated
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const data = (await getPreferences()) as Record<string, unknown>
    snapshot.value = data
    currentUsername.value = String(data.web_ui_username ?? '')

    const next: Record<string, unknown> = {}
    for (const field of allFields) {
      next[field.key] = fromApi(field, data[field.key])
    }
    draft.value = next
  } catch (err) {
    loadError.value = describeError(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

// ---------------------------------------------------------------------------
// Dirty tracking / minimal patch
// ---------------------------------------------------------------------------
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a === null || a === undefined) return b === null || b === undefined
  return false
}

/**
 * Build the payload from changed keys only.
 *
 * Two rules matter here:
 *
 * 1. Comparing through `toApi` means a value that round-trips to the same wire
 *    format is not counted as a change, so opening the page and pressing Save
 *    writes nothing at all.
 *
 * 2. A key the server did not send is skipped entirely. Otherwise we would
 *    "change" it to our default and write that back — inventing a preference
 *    the user never touched, and showing a phantom pending change on load.
 */
const patch = computed(() => {
  const result: Record<string, unknown> = {}
  for (const field of allFields) {
    if (!Object.hasOwn(snapshot.value, field.key)) continue
    const apiValue = toApi(field, draft.value[field.key])
    if (!deepEqual(apiValue, snapshot.value[field.key])) {
      result[field.key] = apiValue
    }
  }
  return result
})

const changeCount = computed(() => Object.keys(patch.value).length)
const isDirty = computed(() => changeCount.value > 0)
const changedKeys = computed(() => new Set(Object.keys(patch.value)))

async function save(): Promise<void> {
  if (!isDirty.value || saving.value) return
  saving.value = true
  try {
    await setPreferences(patch.value as Record<string, never>)
    toast.success(t('settings.saved'))
    // Re-read so the form reflects exactly what the server accepted.
    await load()
    await session.refresh()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    saving.value = false
  }
}

function discard(): void {
  void load()
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
const query = computed(() => searchQuery.value.trim().toLowerCase())
const searching = computed(() => query.value.length > 0)

/** A field shows when it matches the search (or when nothing is typed). */
function fieldVisible(field: SettingField): boolean {
  if (!query.value) return true
  return (
    fieldLabel(field).toLowerCase().includes(query.value) ||
    field.key.toLowerCase().includes(query.value)
  )
}

const visibleGroups = computed(() =>
  groups
    .map((group) => {
      const groupLabel = t(group.labelKey)
      const groupMatches = !query.value || groupLabel.toLowerCase().includes(query.value)
      const fields = group.fields.filter((f) => fieldVisible(f) || groupMatches)
      return { id: group.id, labelKey: group.labelKey, fields, groupLabel }
    })
    .filter((g) => g.fields.length > 0),
)

/**
 * Groups with their sections resolved.
 *
 * Sections are derived from the FILTERED field list, so a search narrows both
 * what is shown and which section headings remain. A heading never appears with
 * nothing under it, which would look like a rendering bug.
 */
const visibleGroupsWithSections = computed(() =>
  visibleGroups.value.map((group) => {
    const source = groups.find((g) => g.id === group.id)
    const all = source ? sectionsForGroup(source, sectionLayout) : []

    // Keep only the fields that survived filtering, preserving section order.
    const allowed = new Set(group.fields.map((f) => f.key))
    const sections = all
      .map((s) => ({
        id: s.id,
        label: t(s.labelKey),
        hint: s.hintKey ? t(s.hintKey) : '',
        fields: s.fields.filter((f) => allowed.has(f.key)),
      }))
      .filter((s) => s.fields.length > 0)

    return { ...group, sections }
  }),
)

/** While searching, show every match at once; otherwise show one tab. */
const groupsToRender = computed(() =>
  searching.value
    ? visibleGroupsWithSections.value
    : visibleGroupsWithSections.value.filter((g) => g.id === activeGroup.value),
)

const tabOptions = computed(() =>
  visibleGroups.value.map((g) => ({ id: g.id, label: g.groupLabel, count: g.fields.length })),
)

// Keep the active tab valid as filters change the available groups.
watch(
  visibleGroups,
  (list) => {
    if (list.length === 0) return
    if (!list.some((g) => g.id === activeGroup.value)) {
      activeGroup.value = list[0].id
    }
  },
  { immediate: true },
)

// ---------------------------------------------------------------------------
// Dependency gating
// ---------------------------------------------------------------------------
/** True when the field's `enabledBy` dependency is currently switched off. */
function dependencyOff(field: SettingField): boolean {
  if (!field.enabledBy) return false
  return draft.value[field.enabledBy] === false
}

const shownCount = computed(() => visibleGroups.value.reduce((n, g) => n + g.fields.length, 0))
</script>

<template>
  <div class="settings">
    <header class="settings__header">
      <div class="settings__title-row">
        <h1 class="settings__title">{{ t('settings.title') }}</h1>
        <MacBadge tone="neutral" size="sm">
          {{ t('settings.fieldCount', { shown: shownCount, total: allFields.length }) }}
        </MacBadge>
      </div>
      <p class="settings__note">{{ t('settings.readOnly') }}</p>
    </header>

    <!-- ===== Toolbar ===== -->
    <div class="settings__toolbar glass-panel">
      <div class="settings__search">
        <MacInput
          id="settings-search"
          v-model="searchQuery"
          type="search"
          inputmode="search"
          :placeholder="t('settings.search')"
        >
          <template #prefix>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path
                d="M10.4 10.4L14 14"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </template>
        </MacInput>
      </div>
    </div>

    <div v-if="loading" class="settings__loading">
      <MacSpinner :size="22" :label="t('status.loading')" />
    </div>

    <div v-else-if="loadError" class="settings__error-card">
      <p class="break-anywhere">{{ loadError }}</p>
      <MacButton variant="secondary" @click="load">{{ t('action.retry') }}</MacButton>
    </div>

    <template v-else>
      <!-- ===== Group tabs ===== -->
      <nav v-if="!searching" class="settings__tabs" role="tablist">
        <button
          v-for="group in tabOptions"
          :key="group.id"
          type="button"
          role="tab"
          class="settings__tab"
          :class="{ 'is-active': activeGroup === group.id }"
          :aria-selected="activeGroup === group.id"
          @click="activeGroup = group.id"
        >
          {{ group.label }}
          <span class="settings__tab-count">{{ group.count }}</span>
        </button>
      </nav>

      <!-- ===== Groups ===== -->
      <section v-for="group in groupsToRender" :key="group.id" class="settings__group">
        <h2 class="settings__group-title">{{ group.groupLabel }}</h2>

        <!-- Credentials live outside the schema-driven list: the password is
             write-only, so it cannot participate in dirty-tracking. -->
        <CredentialsPanel
          v-if="group.id === 'webui'"
          class="settings__credentials"
          :current-username="currentUsername"
          @changed="(name: string) => (currentUsername = name)"
        />

        <!-- One section per cluster of related settings. Each row is a
             self-contained card: label on the left, control on the right. The
             earlier 3-column grid detached labels from their controls, which
             made a 39-item group impossible to read. -->
        <section
          v-for="section in group.sections"
          :key="section.id"
          class="settings__section"
          :aria-labelledby="`sec-${group.id}-${section.id}`"
        >
          <header class="settings__section-head">
            <h3 :id="`sec-${group.id}-${section.id}`" class="settings__section-title">
              {{ section.label }}
            </h3>
            <p v-if="section.hint" class="settings__section-hint">{{ section.hint }}</p>
          </header>

          <div class="settings__rows">
            <SettingFieldControl
              v-for="field in section.fields"
              :key="field.key"
              :field="field"
              :model-value="draft[field.key]"
              :dependency-off="dependencyOff(field)"
              :class="{ 'is-changed': changedKeys.has(field.key) }"
              @update:model-value="(v: unknown) => (draft[field.key] = v)"
            />
          </div>
        </section>
      </section>

      <p v-if="groupsToRender.length === 0" class="settings__no-results">
        {{ t('settings.noMatches') }}
      </p>

      <!-- ===== Sticky save bar ===== -->
      <div class="settings__actions">
        <span v-if="isDirty" class="settings__dirty">
          {{ t('settings.changesPending', { count: changeCount }) }}
        </span>
        <span v-else class="settings__clean">{{ t('settings.noChanges') }}</span>

        <MacButton variant="secondary" :disabled="!isDirty || saving" @click="discard">
          {{ t('action.cancel') }}
        </MacButton>
        <MacButton variant="primary" :disabled="!isDirty" :loading="saving" @click="save">
          {{ t('action.save') }}
        </MacButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  max-width: var(--content-max-width);
  margin: 0 auto;
  width: 100%;
}

.settings__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.settings__title {
  font-size: var(--text-xl);
  font-weight: 600;
}

.settings__note {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* ===== Toolbar ===== */
.settings__toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}

.settings__search {
  flex: 1 1 240px;
  min-width: 0;
  max-width: 420px;
}

/* ===== Tabs ===== */
.settings__tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-active);
  overflow-x: auto;
  scrollbar-width: none;
  max-width: 100%;
}

.settings__tabs::-webkit-scrollbar {
  display: none;
}

.settings__tab {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 30px;
  padding: 0 var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.settings__tab.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
}

.settings__tab-count {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-pill);
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

/* ===== Groups ===== */
.settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
}

.settings__group-title {
  font-size: var(--text-md);
  font-weight: 600;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--separator);
}

.settings__credentials {
  margin-bottom: var(--space-4);
}

/* ---- Sections ----
   A titled cluster of related settings. The heading plus a rule gives the eye
   somewhere to land inside a long list; without it a 39-item group reads as an
   undifferentiated wall. */
.settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings__section + .settings__section {
  margin-top: var(--space-2);
  padding-top: var(--space-5);
  border-top: 1px solid var(--separator);
}

.settings__section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--space-1);
}

.settings__section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.settings__section-hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}

/* One setting per row. A single column is the point: it keeps each label
   adjacent to the control it describes, which a multi-column grid cannot
   guarantee once labels differ in length. */
.settings__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Mark fields with unsaved edits. */
.settings__rows :deep(.is-changed) {
  position: relative;
}

.settings__rows :deep(.is-changed)::before {
  content: '';
  position: absolute;
  left: calc(-1 * var(--space-2));
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--warning);
}

.settings__loading {
  display: grid;
  place-items: center;
  padding: var(--space-10);
}

.settings__error-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--danger-text);
}

.settings__no-results {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-secondary);
}

/* ===== Sticky save bar ===== */
.settings__actions {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--glass-solid);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .settings__actions {
    background: var(--glass-bg);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  }
}

.settings__dirty {
  flex: 1 1 auto;
  font-size: var(--text-sm);
  color: var(--warning-text);
  font-weight: 500;
}

.settings__clean {
  flex: 1 1 auto;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* ===== Responsive =====
   The field list is a single column at every width; only the chrome changes.
   Per-field stacking is handled by SettingFieldControl's own breakpoint. */
@media (max-width: 599px) {
  .settings {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .settings__search {
    max-width: none;
    flex-basis: 100%;
  }

  .settings__actions {
    flex-wrap: wrap;
  }
}
</style>