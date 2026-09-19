<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { FINGER_NAME, FMAP, SRS_DAYS } from '@/data/constants'
import { useSessionStore } from '@/stores/session'
import { useLibraryStore } from '@/stores/library'

const router = useRouter()
const session = useSessionStore()
const library = useLibraryStore()

const metrics = [
  { label: 'Suggested level', value: 'Level 5', hint: 'Symbols and capitals', color: '#d97757' },
  { label: 'Projected WPM', value: '64', hint: 'Range 58–71', color: undefined },
  { label: 'Today’s target', value: '12 min', hint: '4 short drills', color: '#8a9a5b' },
]

const vocabCat = computed(() => library.categories.find((c) => c.kind === 'bilingual') || library.categories[0])

const start = (mode: string, sub?: string) => {
  session.reset({ mode, sub })
  router.push({ name: 'practice' })
}

const recommended = computed(() => [
  {
    level: 'L5', levelColor: '#d97757', title: 'Symbol drill: ; / [ ] mixed',
    reason: 'Semicolon and slash miss 3.2× more than average',
    category: 'Basics', tagColor: 'lime', run: () => start('basic'),
  },
  {
    level: 'L5', levelColor: '#d97757', title: 'JavaScript arrow functions',
    reason: 'You practise code often, but bracket runs stay slow',
    category: 'Code', tagColor: 'magenta', run: () => start('code'),
  },
  {
    level: 'L4', levelColor: '#8a9a5b', title: 'Banking vocabulary: ZH then EN',
    reason: 'Low mastery — start with four sets',
    category: 'Vocabulary', tagColor: 'cyan', run: () => start(vocabCat.value.id, 'Banking'),
  },
  {
    level: 'L6', levelColor: '#c4922f', title: '60-second challenge',
    reason: 'Hit 70 WPM to reach level A',
    category: 'Timed', tagColor: 'gold', run: () => start('timed'),
  },
])

const bookRows = computed(() => session.book.map((b) => ({
  key: b.ch,
  ch: b.ch === ' ' ? '␣' : b.ch,
  total: b.total,
  finger: FINGER_NAME[FMAP[b.ch === ' ' ? 'space' : (b.ch || '').toLowerCase()]] || '',
  dueLabel: b.dueIn <= 0 ? 'Due today' : b.dueIn + 'd left',
  dueColor: b.dueIn <= 0 ? '#c0623f' : '#8b877e',
  bar: Math.round((b.box / SRS_DAYS.length) * 100) + '%',
  barColor: b.box >= 4 ? '#8a9a5b' : b.box >= 2 ? '#c4922f' : '#bc4b3c',
})))

const dueBtn = computed(() =>
  session.dueList.length ? 'Review ' + session.dueList.length + ' keys' : 'Nothing due today')

const startDue = () => {
  if (!session.dueList.length) return
  session.startDueReview()
  router.push({ name: 'practice' })
}
</script>

<template>
  <div class="page">
    <div class="card level-card">
      <div class="level">
        <div class="dim" style="font-size: 14px">Current level</div>
        <div class="level-value">B+</div>
        <div class="small dim">From 32 sessions in 14 days</div>
      </div>
      <div class="level-right">
        <div class="dim-2" style="font-size: 14px">
          Difficulty adapts to your speed, accuracy and error keys. Your next set is ready.
        </div>
        <div class="metrics">
          <div v-for="m in metrics" :key="m.label" class="metric">
            <div class="small dim">{{ m.label }}</div>
            <div class="metric-value" :style="m.color ? { color: m.color } : undefined">{{ m.value }}</div>
            <div class="small dim">{{ m.hint }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="split">
      <div class="card panel">
        <div class="card-title">Recommended today</div>
        <div class="card-sub" style="margin-bottom: 6px">
          Generated from your weak keys; level is re-scored after each run
        </div>
        <div class="scroll-y">
          <div v-for="r in recommended" :key="r.title" class="row rec-row">
            <span class="level-chip" :style="{ background: r.levelColor }">{{ r.level }}</span>
            <div class="rec-main">
              <div class="rec-title ell">{{ r.title }}</div>
              <div class="small dim">{{ r.reason }}</div>
            </div>
            <a-tag :color="r.tagColor">{{ r.category }}</a-tag>
            <div class="btn-slot" style="width: 56px" @click="r.run()">
              <a-button type="primary" size="small">Start</a-button>
            </div>
          </div>
        </div>
      </div>

      <div class="card panel">
        <div class="book-head">
          <span class="card-title">Error book</span>
          <span class="card-sub">Due today {{ session.dueList.length }}</span>
        </div>
        <div class="card-sub" style="margin-bottom: 8px; flex-shrink: 0">
          Spaced repetition:  1 → 2 → 4 → 7 → 15 → 30 d
        </div>
        <div class="scroll-y">
          <div v-for="b in bookRows" :key="b.key" class="book-row">
            <span class="book-key mono">{{ b.ch }}</span>
            <div class="book-main">
              <div class="book-line">
                <span class="small dim-2">×{{ b.total }}　{{ b.finger }}</span>
                <span class="small" :style="{ color: b.dueColor, whiteSpace: 'nowrap' }">{{ b.dueLabel }}</span>
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
.level { text-align: center; border-right: 1px solid var(--line); }
.level-value { font-size: 48px; line-height: 56px; font-weight: 600; color: var(--primary); }
.level-right { display: flex; flex-direction: column; gap: 12px; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.metric { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.metric-value { font-size: 20px; line-height: 28px; font-weight: 600; }

.split {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 12px;
  flex: 1 1 0;
  min-height: 0;
}
.panel { display: flex; flex-direction: column; min-height: 0; }

.rec-row { padding: 12px 0; }
.rec-row :deep(.ant-tag) { margin-inline-end: 0; }
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
.rec-main { flex: 1; min-width: 0; }
.rec-title { font-size: 14px; font-weight: 500; }

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
.book-main { flex: 1; min-width: 0; }
.book-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.book-bar {
  height: 5px;
  border-radius: 100px;
  background: var(--track);
  overflow: hidden;
  margin-top: 4px;
}
.book-bar > i { display: block; height: 5px; border-radius: 100px; }
.book-cta { margin-top: 10px; flex-shrink: 0; }
</style>
