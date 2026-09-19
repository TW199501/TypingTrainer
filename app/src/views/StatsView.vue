<script setup lang="ts">
import { computed } from 'vue'
import { HEAT, HEAT_ROWS, TREND, TREND_ZH } from '@/data/constants'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const summary = [
  { label: 'English WPM', value: '64', hint: 'vs last week +6', color: '#d97757' },
  { label: 'Chinese CPM', value: '42', hint: 'vs last week +4', color: '#b06a4f' },
  { label: 'Avg accuracy', value: '96.4%', hint: 'vs last week +1.2', color: '#8a9a5b' },
  { label: 'Personal best', value: '78', hint: 'Sep 14 · Code', color: '#a8763e' },
]

/** Maps a 30-point series into the 960×260 viewBox between lo and hi. */
const points = (arr: number[], lo: number, hi: number) =>
  arr.map((v, i) => (i * (960 / 29)).toFixed(1) + ',' + (240 - ((v - lo) / (hi - lo)) * 220).toFixed(1)).join(' ')

const speedUnit = computed(() => (session.statsLang === 'zh' ? 'CPM' : 'WPM'))
const wpmPoints = computed(() => (session.statsLang === 'zh'
  ? points(TREND_ZH.map((d) => d.wpm), 26, 52)
  : points(TREND.map((d) => d.wpm), 42, 80)))
const accPoints = computed(() => (session.statsLang === 'zh'
  ? points(TREND_ZH.map((d) => d.acc), 89, 96)
  : points(TREND.map((d) => d.acc), 91, 98)))

const heatRows = HEAT_ROWS.map((r, ri) => ({
  indent: ri * 14 + 'px',
  keys: r.map((k) => {
    const v = HEAT[k] || 0
    return {
      label: k,
      bg: v > 0.005 ? 'rgba(168,65,47,' + (0.08 + v * 4.5).toFixed(2) + ')' : '#f5f1ea',
      color: v > 0.11 ? '#fff' : '#5c5951',
    }
  }),
}))

const history = [
  { type: 'Code', tagColor: 'magenta', wpm: 78, unit: 'WPM', acc: 95.2, when: 'Today 09:12' },
  { type: 'Chinese', tagColor: 'red', wpm: 46, unit: 'CPM', acc: 94.6, when: 'Today 09:02' },
  { type: 'English', tagColor: 'volcano', wpm: 71, unit: 'WPM', acc: 97.8, when: 'Today 08:40' },
  { type: 'Timed', tagColor: 'gold', wpm: 66, unit: 'WPM', acc: 94.1, when: 'Yesterday' },
  { type: 'Chinese', tagColor: 'red', wpm: 41, unit: 'CPM', acc: 93.2, when: 'Yesterday' },
  { type: 'Basics', tagColor: 'lime', wpm: 59, unit: 'WPM', acc: 98.5, when: 'Yesterday' },
  { type: 'English', tagColor: 'volcano', wpm: 63, unit: 'WPM', acc: 96.0, when: 'Sep 17' },
]

const langs: { id: 'en' | 'zh'; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: 'Chinese' },
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
          <span class="card-title">Last 30 days</span>
          <div class="seg">
            <div
              v-for="l in langs"
              :key="l.id"
              class="seg-item seg-item--sm"
              :class="{ 'is-on': session.statsLang === l.id }"
              @click="session.statsLang = l.id"
            >{{ l.label }}</div>
          </div>
        </div>
        <div class="legend">
          <span class="legend-item"><span class="line line--wpm" />{{ speedUnit }}</span>
          <span class="legend-item"><span class="line line--acc" />Accuracy</span>
        </div>
      </div>
      <svg viewBox="0 0 960 260" preserveAspectRatio="none" class="chart">
        <line x1="0" y1="20" x2="960" y2="20" stroke="#ebe5db" />
        <line x1="0" y1="80" x2="960" y2="80" stroke="#ebe5db" />
        <line x1="0" y1="140" x2="960" y2="140" stroke="#ebe5db" />
        <line x1="0" y1="200" x2="960" y2="200" stroke="#ebe5db" />
        <polyline :points="accPoints" fill="none" stroke="#8a9a5b" stroke-width="2" stroke-dasharray="4 4" />
        <polyline :points="wpmPoints" fill="none" stroke="#d97757" stroke-width="2.5" />
      </svg>
      <div class="axis">
        <span>8/21</span><span>8/28</span><span>9/04</span><span>9/11</span><span>9/19</span>
      </div>
    </div>

    <div class="bottom">
      <div class="card heat-card">
        <div class="heat-head">
          <span class="card-title">Error heatmap</span>
          <span class="card-sub ell">Darker means more errors</span>
        </div>
        <div class="heat-rows">
          <div
            v-for="(row, ri) in heatRows"
            :key="ri"
            class="heat-row"
            :style="{ paddingLeft: row.indent }"
          >
            <div
              v-for="k in row.keys"
              :key="k.label"
              class="heat-key"
              :style="{ background: k.bg, color: k.color }"
            >{{ k.label }}</div>
          </div>
        </div>
      </div>

      <div class="card history-card">
        <div class="card-title" style="margin-bottom: 6px">History</div>
        <div class="scroll-y">
          <div v-for="(h, i) in history" :key="i" class="row">
            <a-tag :color="h.tagColor">{{ h.type }}</a-tag>
            <span class="hist-speed nums">{{ h.wpm }}<span class="hist-unit">{{ h.unit }}</span></span>
            <span class="dim-2 nums" style="white-space: nowrap">{{ h.acc }}%</span>
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
.summary-value { font-size: 22px; line-height: 28px; font-weight: 600; }

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
.trend-head-left { display: flex; align-items: center; gap: 10px; }
.seg-item--sm { padding: 3px 12px; font-size: 13px; }
.legend { display: flex; gap: 16px; }
.legend-item {
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.line { width: 14px; height: 2px; display: inline-block; }
.line--wpm { background: var(--primary); }
.line--acc { background: var(--success); }

.chart { width: 100%; flex: 1; min-height: 0; display: block; }
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
.heat-card { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
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
.heat-row { display: flex; gap: 5px; width: 100%; flex: 1 1 0; min-height: 0; }
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

.history-card { display: flex; flex-direction: column; min-height: 0; }
.history-card .row { gap: 8px; }
.history-card :deep(.ant-tag) { margin-inline-end: 0; }
.hist-speed { flex: 1; min-width: 0; font-weight: 500; white-space: nowrap; }
.hist-unit { font-size: 11px; color: var(--text-3); margin-left: 3px; }
.hist-when {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-3);
}
</style>
