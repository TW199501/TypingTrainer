<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { HEAT_ROWS } from '@/data/constants'
import { useStatsStore } from '@/stores/stats'

const { t } = useI18n()
const stats = useStatsStore()

onMounted(() => stats.load())

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const summary = computed(() => {
  const s = stats.summary
  if (!s) return []
  return [
    {
      label: t('stats.englishWpm'),
      value: String(s.englishWpm),
      hint: t('stats.vsLastWeek', { delta: signed(s.englishDelta) }),
      color: '#d97757',
    },
    {
      label: t('stats.chineseCpm'),
      value: String(s.chineseCpm),
      hint: t('stats.vsLastWeek', { delta: signed(s.chineseDelta) }),
      color: '#b06a4f',
    },
    {
      label: t('stats.avgAccuracy'),
      value: `${s.accuracy}%`,
      hint: t('stats.vsLastWeek', { delta: signed(s.accuracyDelta) }),
      color: '#8a9a5b',
    },
    {
      label: t('stats.personalBest'),
      value: String(s.personalBest),
      hint: `${s.personalBestOn} · ${s.personalBestCategory}`,
      color: '#a8763e',
    },
  ]
})

/** Maps a series into the 960×260 viewBox, padded by 8% of its own range. */
function points(values: number[]): string {
  if (!values.length) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.08 || 1
  const min = lo - pad
  const max = hi + pad
  const step = 960 / Math.max(1, values.length - 1)
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(240 - ((v - min) / (max - min)) * 220).toFixed(1)}`)
    .join(' ')
}

const speedPoints = computed(() => points(stats.trend.map((d) => d.speed)))
const accuracyPoints = computed(() => points(stats.trend.map((d) => d.accuracy)))
const speedUnit = computed(() => (stats.lang === 'zh' ? t('status.cpm') : t('status.wpm')))

const axis = computed(() => {
  const dates = stats.trend.map((d) => d.date)
  if (!dates.length) return []
  return [0, 0.25, 0.5, 0.75, 1]
    .map((f) => dates[Math.round(f * (dates.length - 1))])
    .map((d) => d.slice(5).replace('-', '/'))
})

const heatRows = computed(() => {
  const rate = new Map(stats.keyErrors.map((k) => [k.key, k.rate]))
  return HEAT_ROWS.map((row, ri) => ({
    indent: `${ri * 14}px`,
    keys: row.map((k) => {
      const v = rate.get(k) ?? 0
      return {
        label: k,
        bg: v > 0.005 ? `rgba(168,65,47,${(0.08 + v * 4.5).toFixed(2)})` : '#f5f1ea',
        color: v > 0.11 ? '#fff' : '#5c5951',
      }
    }),
  }))
})

const langs: { id: 'en' | 'zh'; label: string }[] = [
  { id: 'en', label: t('stats.english') },
  { id: 'zh', label: t('stats.chinese') },
]
</script>

<template>
  <div class="page">
    <div class="summary">
      <div v-for="s in summary" :key="s.label" class="summary-card">
        <span class="small dim">{{ s.label }}</span>
        <span class="summary-value" :style="{ color: s.color }">{{ s.value }}</span>
        <span class="small dim">{{ s.hint }}</span>
      </div>
    </div>

    <div class="trend">
      <div class="trend-head">
        <div class="trend-head-left">
          <span class="card-title">{{ t('stats.last30') }}</span>
          <div class="seg">
            <div
              v-for="l in langs"
              :key="l.id"
              class="seg-item seg-item--sm"
              :class="{ 'is-on': stats.lang === l.id }"
              @click="stats.lang = l.id"
            >
              {{ l.label }}
            </div>
          </div>
        </div>
        <div class="legend">
          <span class="legend-item"><span class="line line--wpm" />{{ speedUnit }}</span>
          <span class="legend-item"><span class="line line--acc" />{{ t('stats.accuracy') }}</span>
        </div>
      </div>
      <svg viewBox="0 0 960 260" preserveAspectRatio="none" class="chart">
        <line x1="0" y1="20" x2="960" y2="20" stroke="#ebe5db" />
        <line x1="0" y1="80" x2="960" y2="80" stroke="#ebe5db" />
        <line x1="0" y1="140" x2="960" y2="140" stroke="#ebe5db" />
        <line x1="0" y1="200" x2="960" y2="200" stroke="#ebe5db" />
        <polyline
          :points="accuracyPoints"
          fill="none"
          stroke="#8a9a5b"
          stroke-width="2"
          stroke-dasharray="4 4"
        />
        <polyline :points="speedPoints" fill="none" stroke="#d97757" stroke-width="2.5" />
      </svg>
      <div class="axis">
        <span v-for="(a, i) in axis" :key="i">{{ a }}</span>
      </div>
    </div>

    <div class="bottom">
      <div class="card heat-card">
        <div class="heat-head">
          <span class="card-title">{{ t('stats.heatmap') }}</span>
          <span class="card-sub ell">{{ t('stats.heatmapHint') }}</span>
        </div>
        <div class="heat-rows">
          <div v-for="(row, ri) in heatRows" :key="ri" class="heat-row" :style="{ paddingLeft: row.indent }">
            <div
              v-for="k in row.keys"
              :key="k.label"
              class="heat-key"
              :style="{ background: k.bg, color: k.color }"
            >
              {{ k.label }}
            </div>
          </div>
        </div>
      </div>

      <div class="card history-card">
        <div class="card-title" style="margin-bottom: 6px">{{ t('stats.history') }}</div>
        <div class="scroll-y">
          <div v-for="h in stats.history" :key="h.id" class="row">
            <a-tag :color="h.tagColor">{{ h.category }}</a-tag>
            <span class="hist-speed nums"
              >{{ h.speed }}<span class="hist-unit">{{ h.unit }}</span></span
            >
            <span class="dim-2 nums" style="white-space: nowrap">{{ h.accuracy }}%</span>
            <span class="hist-when ell">{{ h.when }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  flex-shrink: 0;
}
.summary-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 8px 14px;
  box-shadow: var(--card-shadow);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.summary-value {
  font-size: 22px;
  line-height: 28px;
  font-weight: 600;
}

.trend {
  background: var(--surface);
  border-radius: 8px;
  padding: 14px 20px 12px;
  box-shadow: var(--card-shadow);
  flex: 0.95 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.trend-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}
.trend-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.seg-item--sm {
  padding: 3px 12px;
  font-size: 13px;
}
.legend {
  display: flex;
  gap: 16px;
}
.legend-item {
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.line {
  width: 14px;
  height: 2px;
  display: inline-block;
}
.line--wpm {
  background: var(--primary);
}
.line--acc {
  background: var(--success);
}

.chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: block;
}
.axis {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
  flex-shrink: 0;
}

.bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 12px;
  flex: 1.25 1 0;
  min-height: 132px;
}
.heat-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.heat-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
/* Rows split the card's remaining height, so keys never spill out. */
.heat-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
}
.heat-row {
  display: flex;
  gap: 5px;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
}
.heat-key {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 12px;
  flex: 1 1 0;
  min-width: 0;
  box-shadow: inset 0 0 0 1px var(--line);
}

.history-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.history-card .row {
  gap: 8px;
}
.history-card :deep(.ant-tag) {
  margin-inline-end: 0;
}
.hist-speed {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  white-space: nowrap;
}
.hist-unit {
  font-size: 11px;
  color: var(--text-3);
  margin-left: 3px;
}
.hist-when {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-3);
}
</style>
