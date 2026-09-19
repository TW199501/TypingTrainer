<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FMAP, SRS_DAYS } from '@/data/constants'
import { useCoachStore } from '@/stores/coach'
import { useSessionStore } from '@/stores/session'
import { useLibraryStore } from '@/stores/library'

const { t } = useI18n()
const router = useRouter()
const coach = useCoachStore()
const session = useSessionStore()
const library = useLibraryStore()

onMounted(() => coach.load())

const metrics = computed(() => {
  const d = coach.data
  if (!d) return []
  return [
    {
      key: 'level',
      label: t('coach.suggestedLevel'),
      value: d.suggestedLevel,
      hint: t('coach.symbolsAndCaps'),
      color: '#d97757',
    },
    {
      key: 'projected',
      label: t('coach.projected'),
      value: String(d.projectedWpm),
      hint: t('coach.range', { range: d.projectedRange }),
      color: undefined,
    },
    {
      key: 'target',
      label: t('coach.todayTarget'),
      value: t('coach.minutes', { count: d.dailyTargetMinutes }),
      hint: t('coach.drills', { count: d.dailyTargetDrills }),
      color: '#8a9a5b',
    },
  ]
})

const levelColor: Record<string, string> = { L4: '#8a9a5b', L5: '#d97757', L6: '#c4922f' }

const recommended = computed(() =>
  (coach.data?.recommended ?? []).map((r) => ({
    ...r,
    title: t(`coach.items.${r.key}.title`),
    reason: t(`coach.items.${r.key}.reason`),
    levelColor: levelColor[r.level] || '#8a9a5b',
  })),
)

/** `mode` names a category kind; resolve it against the loaded categories. */
function start(mode: string, sub?: string) {
  const cat = library.categories.find((c) => c.kind === mode || c.id === mode)
  session.reset({ mode: cat?.id ?? mode, sub })
  router.push({ name: 'practice' })
}

const bookRows = computed(() =>
  session.book.map((b) => {
    const finger = FMAP[b.ch === ' ' ? 'space' : (b.ch || '').toLowerCase()]
    return {
      key: b.ch,
      ch: b.ch === ' ' ? '␣' : b.ch,
      total: b.total,
      finger: finger ? t(`practice.fingers.${finger}`) : '',
      dueLabel: b.dueIn <= 0 ? t('coach.dueLabel') : t('coach.daysLeft', { count: b.dueIn }),
      dueColor: b.dueIn <= 0 ? '#c0623f' : '#8b877e',
      bar: Math.round((b.box / SRS_DAYS.length) * 100) + '%',
      barColor: b.box >= 4 ? '#8a9a5b' : b.box >= 2 ? '#c4922f' : '#bc4b3c',
    }
  }),
)

const dueBtn = computed(() =>
  session.dueList.length ? t('coach.reviewKeys', { count: session.dueList.length }) : t('coach.nothingDue'),
)

function startDue() {
  if (!session.dueList.length) return
  session.startDueReview()
  router.push({ name: 'practice' })
}
</script>

<template>
  <div class="page">
    <div class="card level-card">
      <div class="level">
        <div class="dim" style="font-size: 14px">{{ t('coach.currentLevel') }}</div>
        <div class="level-value">{{ coach.data?.level ?? '—' }}</div>
        <div class="small dim">
          {{ t('coach.from', { sessions: coach.data?.sessions ?? 0, days: coach.data?.days ?? 0 }) }}
        </div>
      </div>
      <div class="level-right">
        <div class="dim-2" style="font-size: 14px">{{ t('coach.adapts') }}</div>
        <div class="metrics">
          <div v-for="m in metrics" :key="m.key" class="metric">
            <div class="small dim">{{ m.label }}</div>
            <div class="metric-value" :style="m.color ? { color: m.color } : undefined">{{ m.value }}</div>
            <div class="small dim">{{ m.hint }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="split">
      <div class="card panel">
        <div class="card-title">{{ t('coach.recommended') }}</div>
        <div class="card-sub" style="margin-bottom: 6px">{{ t('coach.recommendedHint') }}</div>
        <div class="scroll-y">
          <div v-for="r in recommended" :key="r.id" class="row rec-row">
            <span class="level-chip" :style="{ background: r.levelColor }">{{ r.level }}</span>
            <div class="rec-main">
              <div class="rec-title ell">{{ r.title }}</div>
              <div class="small dim">{{ r.reason }}</div>
            </div>
            <a-tag :color="r.tagColor">{{ r.category }}</a-tag>
            <div class="btn-slot" style="width: 56px" @click="start(r.mode, r.sub)">
              <a-button type="primary" size="small">{{ t('common.start') }}</a-button>
            </div>
          </div>
        </div>
      </div>

      <div class="card panel">
        <div class="book-head">
          <span class="card-title">{{ t('coach.errorBook') }}</span>
          <span class="card-sub">{{ t('coach.dueToday', { count: session.dueList.length }) }}</span>
        </div>
        <div class="card-sub" style="margin-bottom: 8px; flex-shrink: 0">{{ t('coach.srs') }}</div>
        <div class="scroll-y">
          <div v-for="b in bookRows" :key="b.key" class="book-row">
            <span class="book-key mono">{{ b.ch }}</span>
            <div class="book-main">
              <div class="book-line">
                <span class="small dim-2">×{{ b.total }}　{{ b.finger }}</span>
                <span class="small" :style="{ color: b.dueColor, whiteSpace: 'nowrap' }">{{
                  b.dueLabel
                }}</span>
              </div>
              <div class="book-bar"><i :style="{ width: b.bar, background: b.barColor }" /></div>
            </div>
          </div>
        </div>
        <div class="btn-slot book-cta" @click="startDue()">
          <a-button type="primary">{{ dueBtn }}</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.level-card {
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  gap: 24px;
  align-items: center;
  flex-shrink: 0;
}
.level {
  text-align: center;
  border-right: 1px solid var(--line);
}
.level-value {
  font-size: 48px;
  line-height: 56px;
  font-weight: 600;
  color: var(--primary);
}
.level-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.metric {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
}
.metric-value {
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 12px;
  flex: 1 1 0;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rec-row {
  padding: 12px 0;
}
.rec-row :deep(.ant-tag) {
  margin-inline-end: 0;
}
.level-chip {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.rec-main {
  flex: 1;
  min-width: 0;
}
.rec-title {
  font-size: 14px;
  font-weight: 500;
}

.book-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.book-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.book-key {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: rgba(168, 65, 47, 0.1);
  color: #a8412f;
}
.book-main {
  flex: 1;
  min-width: 0;
}
.book-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.book-bar {
  height: 5px;
  border-radius: 100px;
  background: var(--track);
  overflow: hidden;
  margin-top: 4px;
}
.book-bar > i {
  display: block;
  height: 5px;
  border-radius: 100px;
}
.book-cta {
  margin-top: 10px;
  flex-shrink: 0;
}
</style>
