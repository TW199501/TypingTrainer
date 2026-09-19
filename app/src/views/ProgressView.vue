<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const scopes: { id: 'self' | 'social'; label: string }[] = [
  { id: 'self', label: 'You' },
  { id: 'social', label: 'Leaderboard' },
]
const periods: { id: 'daily' | 'weekly'; label: string }[] = [
  { id: 'daily', label: 'Week' },
  { id: 'weekly', label: 'Month' },
]
const langs: { id: 'en' | 'zh'; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: 'Chinese' },
]

const compareRows = computed(() => {
  const weekly = session.period === 'daily'
  const raw = [
    { label: 'Avg WPM', now: weekly ? 64 : 61, prev: weekly ? 58 : 52, unit: '' },
    { label: 'Best WPM', now: 78, prev: weekly ? 73 : 69, unit: '' },
    { label: 'Chinese CPM', now: 42, prev: weekly ? 38 : 34, unit: '' },
    { label: 'Accuracy', now: 96.4, prev: weekly ? 95.2 : 94.1, unit: '%' },
    { label: 'Practice runs', now: weekly ? 31 : 118, prev: weekly ? 24 : 96, unit: '' },
    { label: 'Time spent', now: weekly ? 2.6 : 9.8, prev: weekly ? 2.1 : 8.4, unit: 'h' },
  ]
  return raw.map((r) => {
    const d = Math.round((r.now - r.prev) * 10) / 10
    return {
      label: r.label,
      now: r.now + r.unit,
      prev: r.prev + r.unit,
      delta: (d > 0 ? '+' : '') + d + r.unit,
      deltaColor: d > 0 ? '#8a9a5b' : d < 0 ? '#bc4b3c' : '#8b877e',
      bar: Math.min(100, Math.round((r.now / Math.max(r.now, r.prev)) * 100)) + '%',
      barPrev: Math.min(100, Math.round((r.prev / Math.max(r.now, r.prev)) * 100)) + '%',
    }
  })
})

const bestRows = [
  { title: 'Q3 revenue outlook', cat: 'Chinese › Finance', best: 52, prev: 45, when: 'Today' },
  { title: 'SQL query drills #12', cat: 'Code › SQL', best: 63, prev: 58, when: 'Yesterday' },
  { title: 'Refund reply template', cat: 'English › Support email', best: 74, prev: 74, when: 'Sep 16' },
  { title: 'AI chip supply chain report', cat: 'English › Tech news', best: 72, prev: 66, when: 'Sep 09' },
  { title: 'FX and fee vocabulary', cat: 'Vocabulary › Banking', best: 61, prev: 54, when: 'Sep 14' },
].map((r) => ({
  ...r,
  delta: (r.best - r.prev > 0 ? '+' : '') + (r.best - r.prev),
  deltaColor: r.best > r.prev ? '#8a9a5b' : '#8b877e',
}))

const AVATARS = ['#d97757', '#a8763e', '#7d8c5c', '#b06a4f', '#8a7b5c', '#c08552', '#9a5f4a', '#6f8f85']

const board = computed(() => {
  const rows: [string, number, number, number][] = session.boardLang === 'zh'
    ? [['wu.dan', 58, 96.2, 14], ['chen.wei', 52, 94.7, 11], ['lin.yu', 49, 97.5, 18], ['ming.h', 46, 95.8, 9],
      ['a.kuo', 44, 93.9, 12], ['sara.t', 41, 96.4, 7], ['j.hsu', 38, 94.1, 6], ['peng.l', 35, 92.8, 5]]
    : [['lin.yu', 92, 98.4, 31], ['chen.wei', 78, 95.2, 24], ['a.kuo', 75, 97.1, 19], ['ming.h', 71, 96.6, 28],
      ['sara.t', 69, 94.8, 15], ['j.hsu', 66, 97.9, 22], ['peng.l', 64, 93.5, 11], ['wu.dan', 61, 95.0, 17]]
  return rows.map((b, i) => ({
    rank: i + 1,
    name: b[0],
    initial: b[0][0].toUpperCase(),
    wpm: b[1],
    acc: b[2],
    runs: b[3],
    rankColor: i < 3 ? '#d97757' : '#8b877e',
    rowBg: b[0] === 'chen.wei' ? 'rgba(217,119,87,0.05)' : 'transparent',
    avatarBg: AVATARS[i % 8],
  }))
})

const speedUnitBoard = computed(() => (session.boardLang === 'zh' ? 'CPM' : 'WPM'))
const gapAhead = computed(() => (session.boardLang === 'zh' ? '6 CPM' : '14 WPM'))
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="seg">
        <div
          v-for="sc in scopes"
          :key="sc.id"
          class="seg-item"
          :class="{ 'is-on': session.scope === sc.id }"
          @click="session.scope = sc.id"
        >{{ sc.label }}</div>
      </div>
      <div class="seg">
        <div
          v-for="p in periods"
          :key="p.id"
          class="seg-item seg-item--wide"
          :class="{ 'is-on': session.period === p.id }"
          @click="session.period = p.id"
        >{{ p.label }}</div>
      </div>
      <span v-if="session.scope === 'self'" class="card-sub">Solid = this period, light = previous</span>
    </div>

    <template v-if="session.scope === 'self'">
      <div class="card panel panel--overview">
        <div class="card-title" style="margin-bottom: 6px">Overview</div>
        <div class="scroll-y">
          <div v-for="r in compareRows" :key="r.label" class="row">
            <span class="cmp-label">{{ r.label }}</span>
            <div class="bars">
              <span class="bar"><i :style="{ width: r.bar }" /></span>
              <span class="bar bar--prev"><i :style="{ width: r.barPrev }" /></span>
            </div>
            <span class="cmp-now nums">{{ r.now }}</span>
            <span class="cmp-prev nums">{{ r.prev }}</span>
            <span class="cmp-delta" :style="{ color: r.deltaColor }">{{ r.delta }}</span>
          </div>
        </div>
      </div>

      <div class="card panel panel--bests">
        <div class="bests-head">
          <span class="card-title">Personal bests by text</span>
          <span class="card-sub">vs previous record</span>
        </div>
        <div class="scroll-y">
          <div v-for="b in bestRows" :key="b.title" class="row">
            <div class="best-main">
              <div class="ell">{{ b.title }}</div>
              <div class="small dim ell">{{ b.cat }}</div>
            </div>
            <span class="best-value nums">{{ b.best }}</span>
            <span class="best-prev nums">{{ b.prev }}</span>
            <span class="best-delta" :style="{ color: b.deltaColor }">{{ b.delta }}</span>
            <span class="best-when">{{ b.when }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card rank-card">
        <div class="rank-stat">
          <span class="small dim">Your rank</span>
          <span class="rank-value">#2</span>
          <span class="small" style="color: var(--success)">↑ 1 名</span>
        </div>
        <div class="vsep" />
        <div class="rank-stat">
          <span class="small dim">Gap to next</span>
          <span style="font-size: 14px; font-weight: 600">{{ gapAhead }}</span>
        </div>
        <div class="seg" style="margin-left: auto">
          <div
            v-for="l in langs"
            :key="l.id"
            class="seg-item seg-item--sm"
            :class="{ 'is-on': session.boardLang === l.id }"
            @click="session.boardLang = l.id"
          >{{ l.label }}</div>
        </div>
      </div>

      <div class="card card--flush panel panel--board">
        <div class="board-head">
          <span class="col-rank">#</span>
          <span class="col-user">User</span>
          <span class="col-num">{{ speedUnitBoard }}</span>
          <span class="col-num">Accuracy</span>
          <span class="col-runs">Runs</span>
        </div>
        <div class="scroll-y">
          <div v-for="b in board" :key="b.name" class="row board-row" :style="{ background: b.rowBg }">
            <span class="col-rank rank-cell" :style="{ color: b.rankColor }">{{ b.rank }}</span>
            <span class="col-user user-cell">
              <span class="avatar" :style="{ background: b.avatarBg }">{{ b.initial }}</span>
              <span class="ell">{{ b.name }}</span>
            </span>
            <span class="col-num nums" style="font-weight: 600">{{ b.wpm }}</span>
            <span class="col-num nums dim-2">{{ b.acc }}%</span>
            <span class="col-runs dim">{{ b.runs }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }
.seg-item--wide { padding: 5px 18px; }
.seg-item--sm { padding: 4px 14px; font-size: 13px; }

.panel { display: flex; flex-direction: column; flex: 1 1 0; }
.panel--overview { min-height: 140px; }
.panel--bests { min-height: 130px; }
.panel--board { min-height: 140px; }

.cmp-label {
  width: 84px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-2);
  white-space: nowrap;
}
.bars { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.bar--prev { height: 6px; background: #f5f1ea; }
.bar--prev > i { background: #e3c3b4; }
.cmp-now { width: 62px; flex-shrink: 0; text-align: right; font-weight: 600; white-space: nowrap; }
.cmp-prev {
  width: 58px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.cmp-delta {
  width: 56px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.bests-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.best-main { flex: 1; min-width: 0; }
.best-value { width: 52px; flex-shrink: 0; text-align: right; font-weight: 600; }
.best-prev { width: 44px; flex-shrink: 0; text-align: right; font-size: 12px; color: var(--text-3); }
.best-delta { width: 40px; flex-shrink: 0; text-align: right; font-size: 13px; font-weight: 500; }
.best-when {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.rank-card {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.rank-stat { display: flex; align-items: baseline; gap: 8px; }
.rank-value { font-size: 24px; line-height: 30px; font-weight: 600; color: var(--primary); }
.vsep { width: 1px; height: 24px; background: var(--line); }

.board-head {
  display: flex;
  gap: 12px;
  padding: 14px 0 10px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  flex-shrink: 0;
}
.board-row { font-size: 14px; }
.col-rank { width: 40px; flex-shrink: 0; }
.col-user { flex: 1; min-width: 0; }
.col-num { width: 62px; flex-shrink: 0; text-align: right; }
.col-runs { width: 52px; flex-shrink: 0; text-align: right; }
.rank-cell { font-weight: 600; }
.user-cell { display: flex; align-items: center; gap: 8px; overflow: hidden; }
.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}
</style>
