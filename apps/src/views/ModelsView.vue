<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/stores/ai'
import { useGridLayout } from '@/composables/useGridLayout'

const { t } = useI18n()
const ai = useAiStore()
const { aiCols } = useGridLayout()

// The catalogue and the install directory both come from the runtime that owns
// the disk, so they are fetched rather than assumed.
onMounted(() => {
  if (!ai.modelsLoaded) ai.loadModels()
})

const used = computed(
  () => (ai.localModels.filter((m) => m.installed).reduce((a, m) => a + m.mb, 0) / 1024).toFixed(2) + ' GB',
)

const rows = computed(() =>
  ai.localModels.map((m, i) => ({
    i,
    name: m.name,
    note: m.note,
    size: m.mb >= 1024 ? (m.mb / 1024).toFixed(1) + ' GB' : m.mb + ' MB',
    kind: m.kind,
    kindBg:
      m.kind === 'Embed'
        ? 'rgba(111,143,133,0.14)'
        : m.kind === 'Rerank'
          ? 'rgba(168,118,62,0.14)'
          : 'rgba(217,119,87,0.12)',
    kindColor: m.kind === 'Embed' ? '#4f6b62' : m.kind === 'Rerank' ? '#8a6428' : '#c0623f',
    actionLabel: m.installed ? t('models.remove') : t('models.download'),
    actionColor: m.installed ? '#8b877e' : '#d97757',
  })),
)
</script>

<template>
  <div class="page">
    <div class="grid" :style="{ gridTemplateColumns: aiCols }">
      <div class="card panel" style="gap: 8px">
        <div class="storage-head">
          <span class="card-title">{{ t('models.storage') }}</span>
          <span class="card-sub" style="line-height: 18px">{{ t('models.storageHint') }}</span>
        </div>
        <div class="field" style="flex-shrink: 0">
          <label>{{ t('models.location') }}</label>
          <!-- Read-only: the path is resolved by the desktop shell or the
               server, so typing a different one here would not move anything. -->
          <input :value="ai.modelDir" class="input input--sm input--code" readonly :title="ai.modelDir" />
        </div>
        <div class="used">
          <span class="small dim-2">{{ t('models.used') }}</span>
          <span style="font-size: 14px; font-weight: 600">{{ used }}</span>
        </div>
        <div class="foot-note">{{ t('models.preferLocal') }}</div>
      </div>

      <div class="card panel">
        <div class="card-title" style="flex-shrink: 0">{{ t('models.available') }}</div>
        <div class="scroll-y" style="padding-top: 4px">
          <div v-for="m in rows" :key="m.name" class="model-row">
            <span class="kind" :style="{ background: m.kindBg, color: m.kindColor }">{{
              t(`models.kind.${m.kind}`)
            }}</span>
            <div style="flex: 1; min-width: 0">
              <div class="model-name ell">{{ m.name }}</div>
              <div class="model-note ell">{{ m.note }} · {{ m.size }}</div>
            </div>
            <span class="action" :style="{ color: m.actionColor }" @click="ai.toggleLocalModel(m.i)">
              {{ m.actionLabel }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 12px;
}
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.storage-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.input--code {
  font-family: var(--font-mono);
}
.used {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg);
  flex-shrink: 0;
}
.foot-note {
  margin-top: auto;
  font-size: 12px;
  color: var(--text-3);
  line-height: 18px;
  flex-shrink: 0;
}
.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.kind {
  width: 52px;
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 0;
  text-align: center;
  border-radius: 4px;
}
.model-name {
  font-size: 13px;
}
.model-note {
  font-size: 11px;
  color: var(--text-3);
}
.action {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
</style>
