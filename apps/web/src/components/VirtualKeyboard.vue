<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FING, FMAP, ROWS, ROW_UNITS, ZHUYIN } from '@/data/constants'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ height: number; showHint: boolean; legendVisible: boolean }>()

const { t } = useI18n()
const session = useSessionStore()

const rows = computed(() =>
  ROWS.map((row) => ({
    pad: (ROW_UNITS - row.reduce((a, k) => a + k[1], 0)) / 2,
    keys: row.map(([id, w, label]) => {
      const active = id === session.nextKey
      const down = session.pressed === id
      const zsym = ZHUYIN[id]
      // Chinese layouts print the bopomofo symbol with the latin key as a subscript.
      const zh = session.layout !== 'en' && !!zsym && id.length === 1
      const finger = FMAP[id]
      return {
        id,
        label: zh ? zsym : label || id,
        sub: zh ? id : '',
        w,
        bg: down ? '#c0623f' : active ? '#d97757' : '#f5f1ea',
        color: down || active ? '#fff' : '#5c5951',
        shadow:
          (down
            ? 'inset 0 0 0 2px #8c4a33'
            : active
              ? '0 2px 6px rgba(217,119,87,0.32)'
              : 'inset 0 0 0 1px #ddd6ca') +
          ', inset 0 -3px 0 0 ' +
          (FING[finger] || 'transparent'),
      }
    }),
  })),
)

const legend = [
  { color: FING.pinkyL, key: 'pinky' },
  { color: FING.ringL, key: 'ring' },
  { color: FING.midL, key: 'middle' },
  { color: FING.idxL, key: 'lIndex' },
  { color: FING.idxR, key: 'rIndex' },
]

const nextKeyLabel = computed(() =>
  session.nextRaw ? (session.nextRaw === ' ' ? t('status.space') : session.nextRaw) : t('common.dash'),
)
const nextFingerLabel = computed(() =>
  session.nextFinger ? t(`practice.fingers.${session.nextFinger}`) : '',
)
</script>

<template>
  <div class="keyboard" :style="{ height: props.height + 'px' }">
    <div v-if="props.showHint" class="kb-head">
      <span class="kb-title">
        {{ t('practice.keyboard') }}　{{ t('practice.nextKey') }}:
        <span class="kb-next">{{ nextKeyLabel }}</span
        >　{{ nextFingerLabel }}
      </span>
      <div class="legend" :style="{ opacity: props.legendVisible ? 1 : 0 }">
        <span v-for="f in legend" :key="f.key" class="legend-item">
          <span class="legend-swatch" :style="{ background: f.color }" />{{ t(`practice.legend.${f.key}`) }}
        </span>
      </div>
    </div>
    <div class="kb-rows">
      <div v-for="(row, ri) in rows" :key="ri" class="kb-row">
        <span class="kb-pad" :style="{ flex: `${row.pad} 1 0` }" />
        <div
          v-for="k in row.keys"
          :key="k.id"
          class="key"
          :style="{ flex: `${k.w} 1 0`, background: k.bg, color: k.color, boxShadow: k.shadow }"
        >
          <span class="key-label">{{ k.label }}</span>
          <span v-if="k.sub" class="key-sub">{{ k.sub }}</span>
        </div>
        <span class="kb-pad" :style="{ flex: `${row.pad} 1 0` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard {
  background: var(--surface);
  border-radius: 8px;
  padding: 10px 20px 12px;
  box-shadow: var(--card-shadow);
  flex: 0 0 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.kb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.kb-title {
  font-size: 14px;
  color: var(--text-2);
}
.kb-next {
  color: var(--primary);
  font-weight: 600;
}
.legend {
  display: flex;
  gap: 14px;
  align-items: center;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

/* Rows share whatever height the card gets, so the keyboard never overflows. */
.kb-rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
}
.kb-row {
  display: flex;
  gap: 5px;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
}
.kb-pad {
  min-width: 0;
}
.key {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0 2px 2px;
  border-radius: 6px;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
}
.key-label {
  line-height: 1;
}
.key-sub {
  font-size: 9px;
  line-height: 1;
  opacity: 0.5;
  margin-left: 3px;
}
</style>
