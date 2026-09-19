<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProgressStore } from '@/stores/progress'

const { t } = useI18n()
const progress = useProgressStore()

onMounted(() => progress.load())

const scopes: { id: 'self' | 'social'; label: string }[] = [
  { id: 'self', label: t('progress.you') },
  { id: 'social', label: t('progress.leaderboard') },
]
const periods: { id: 'weekly' | 'monthly'; label: string }[] = [
  { id: 'weekly', label: t('progress.week') },
  { id: 'monthly', label: t('progress.month') },
]
const langs: { id: 'en' | 'zh'; label: string }[] = [
  { id: 'en', label: t('stats.english') },
  { id: 'zh', label: t('stats.chinese') },
]

const AVATARS = ['#d97757', '#a8763e', '#7d8c5c', '#b06a4f', '#8a7b5c', '#c08552', '#9a5f4a', '#6f8f85']

const compareRows = computed(() =>
  progress.compare.map((r) => {
    const d = Math.round((r.now - r.prev) * 10) / 10
    const max = Math.max(r.now, r.prev) || 1
    return {
      key: r.key,
      label: t(`progress.rows.${r.key}`),
      now: r.now + r.unit,
      prev: r.prev + r.unit,
      delta: (d > 0 ? '+' : '') + d + r.unit,
      deltaColor: d > 0 ? '#8a9a5b' : d < 0 ? '#bc4b3c' : '#8b877e',
      bar: Math.min(100, Math.round((r.now / max) * 100)) + '%',
      barPrev: Math.min(100, Math.round((r.prev / max) * 100)) + '%',
    }
  }),
)

const bestRows = computed(() =>
  progress.bests.map((r) => ({
    ...r,
    delta: (r.best - r.prev > 0 ? '+' : '') + (r.best - r.prev),
    deltaColor: r.best > r.prev ? '#8a9a5b' : '#8b877e',
  })),
)

const board = computed(() =>
  progress.board.map((b, i) => ({
    ...b,
    initial: b.name[0].toUpperCase(),
    rankColor: i < 3 ? '#d97757' : '#8b877e',
    rowBg: b.isMe ? 'rgba(217,119,87,0.05)' : 'transparent',
    avatarBg: AVATARS[i % AVATARS.length],
  })),
)

const me = computed(() => progress.board.find((b) => b.isMe))
const gapAhead = computed(() => {
  const mine = me.value
  if (!mine || mine.rank <= 1) return t('common.dash')
  const ahead = progress.board.find((b) => b.rank === mine.rank - 1)
  const unit = progress.lang === 'zh' ? t('status.cpm') : t('status.wpm')
  return ahead ? `${ahead.speed - mine.speed} ${unit}` : t('common.dash')
})
const speedUnitBoard = computed(() => (progress.lang === 'zh' ? t('status.cpm') : t('status.wpm')))
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="seg">
        <div
          v-for="sc in scopes"
          :key="sc.id"
          class="seg-item"
          :class="{ 'is-on': progress.scope === sc.id }"
          @click="progress.scope = sc.id"
        >
          {{ sc.label }}
        </div>
      </div>
      <div class="seg">
        <div
          v-for="p in periods"
          :key="p.id"
          class="seg-item seg-item--wide"
          :class="{ 'is-on': progress.period === p.id }"
          @click="progress.period = p.id"
        >
          {{ p.label }}
        </div>
      </div>
      <span v-if="progress.scope === 'self'" class="card-sub">{{ t('progress.legend') }}</span>
    </div>

    <template v-if="progress.scope === 'self'">
      <div class="card panel panel--overview">
        <div class="card-title" style="margin-bottom: 6px">{{ t('progress.overview') }}</div>
        <div class="scroll-y">
          <div v-for="r in compareRows" :key="r.key" class="row">
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
          <span class="card-title">{{ t('progress.bests') }}</span>
          <span class="card-sub">{{ t('progress.vsPrevious') }}</span>
        </div>
        <div class="scroll-y">
          <div v-for="b in bestRows" :key="b.title" class="row">
            <div class="best-main">
              <div class="ell">{{ b.title }}</div>
              <div class="small dim ell">{{ b.category }}</div>
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
          <span class="small dim">{{ t('progress.yourRank') }}</span>
          <span class="rank-value">#{{ me?.rank ?? '—' }}</span>
          <span class="small" style="color: var(--success)">{{ t('progress.rankDelta', { count: 1 }) }}</span>
        </div>
        <div class="vsep" />
        <div class="rank-stat">
          <span class="small dim">{{ t('progress.gapToNext') }}</span>
          <span style="font-size: 14px; font-weight: 600">{{ gapAhead }}</span>
        </div>
        <div class="seg" style="margin-left: auto">
          <div
            v-for="l in langs"
            :key="l.id"
            class="seg-item seg-item--sm"
            :class="{ 'is-on': progress.lang === l.id }"
            @click="progress.lang = l.id"
          >
            {{ l.label }}
          </div>
        </div>
      </div>

      <div class="card card--flush panel panel--board">
        <div class="board-head">
          <span class="col-rank">#</span>
          <span class="col-user">{{ t('progress.user') }}</span>
          <span class="col-num">{{ speedUnitBoard }}</span>
          <span class="col-num">{{ t('status.accuracy') }}</span>
          <span class="col-runs">{{ t('progress.runs') }}</span>
        </div>
        <div class="scroll-y">
          <div v-for="b in board" :key="b.name" class="row board-row" :style="{ background: b.rowBg }">
            <span class="col-rank rank-cell" :style="{ color: b.rankColor }">{{ b.rank }}</span>
            <span class="col-user user-cell">
              <span class="avatar" :style="{ background: b.avatarBg }">{{ b.initial }}</span>
              <span class="ell">{{ b.name }}</span>
            </span>
            <span class="col-num nums" style="font-weight: 600">{{ b.speed }}</span>
            <span class="col-num nums dim-2">{{ b.accuracy }}%</span>
            <span class="col-runs dim">{{ b.runs }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.seg-item--wide {
  padding: 5px 18px;
}
.seg-item--sm {
  padding: 4px 14px;
  font-size: 13px;
}

.panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
}
.panel--overview {
  min-height: 140px;
}
.panel--bests {
  min-height: 130px;
}
.panel--board {
  min-height: 140px;
}

.cmp-label {
  width: 84px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-2);
  white-space: nowrap;
}
.bars {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bar--prev {
  height: 6px;
  background: #f5f1ea;
}
.bar--prev > i {
  background: #e3c3b4;
}
.cmp-now {
  width: 62px;
  flex-shrink: 0;
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
}
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
.best-main {
  flex: 1;
  min-width: 0;
}
.best-value {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  font-weight: 600;
}
.best-prev {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
}
.best-delta {
  width: 40px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
}
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
.rank-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rank-value {
  font-size: 24px;
  line-height: 30px;
  font-weight: 600;
  color: var(--primary);
}
.vsep {
  width: 1px;
  height: 24px;
  background: var(--line);
}

.board-head {
  display: flex;
  gap: 12px;
  padding: 14px 0 10px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  flex-shrink: 0;
}
.board-row {
  font-size: 14px;
}
.col-rank {
  width: 40px;
  flex-shrink: 0;
}
.col-user {
  flex: 1;
  min-width: 0;
}
.col-num {
  width: 62px;
  flex-shrink: 0;
  text-align: right;
}
.col-runs {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
}
.rank-cell {
  font-weight: 600;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
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
