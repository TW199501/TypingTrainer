<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()

const elapsedLabel = computed(() => Math.round(session.elapsedMs / 100) / 10 + 's')
const verdict = computed(() =>
  session.wpm >= 70 ? 'Faster than 92% of users'
    : session.wpm >= 50 ? 'Steady — work on accuracy'
      : 'Keep practising')

const again = () => { session.startRun(); router.push({ name: 'practice' }) }
const review = () => { session.startReview(); router.push({ name: 'practice' }) }
</script>

<template>
  <div class="page page--flow">
    <div class="score-card">
      <div class="dim">Your score</div>
      <div class="score nums">{{ session.speed }}</div>
      <div class="score-sub">{{ session.speedUnit }}　{{ verdict }}</div>
      <div class="metrics">
        <div class="metric">
          <div class="metric-label">Accuracy</div>
          <div class="metric-value" :style="{ color: session.accColor }">{{ session.accuracy }}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">Time</div>
          <div class="metric-value">{{ elapsedLabel }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Errors</div>
          <div class="metric-value" style="color: var(--error)">{{ session.errorCount }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Characters</div>
          <div class="metric-value">{{ session.typed.length }}</div>
        </div>
      </div>
    </div>

    <div class="card" style="padding: 20px 24px">
      <div class="misses-head">
        <span class="card-title">Most missed keys</span>
        <span class="card-sub">Added to the error book for tomorrow</span>
      </div>
      <div v-if="session.topErrors.length" class="misses">
        <div v-for="e in session.topErrors" :key="e.key" class="miss">
          <span class="miss-key mono">{{ e.key }}</span>
          <span class="dim">×{{ e.count }}</span>
        </div>
      </div>
      <div v-else class="dim">No mistakes this round. Keep it up.</div>
    </div>

    <div class="buttons">
      <div class="btn-slot" style="width: 96px" @click="again()">
        <a-button type="primary">Again</a-button>
      </div>
      <div v-if="session.topErrors.length" class="btn-slot" style="width: 96px" @click="review()">
        <a-button>Review</a-button>
      </div>
      <div class="btn-slot" style="width: 96px" @click="router.push({ name: 'stats' })">
        <a-button>Stats</a-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 32px;
  box-shadow: var(--card-shadow);
  text-align: center;
}
.score {
  font-size: 64px;
  line-height: 72px;
  font-weight: 600;
  color: var(--primary);
  margin: 4px 0 2px;
}
.score-sub { font-size: 14px; color: var(--text-3); margin-bottom: 20px; }
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  text-align: left;
}
.metric { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.metric-label { font-size: 14px; color: var(--text-3); }
.metric-value { font-size: 24px; line-height: 32px; font-weight: 600; }

.misses-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.misses { display: flex; flex-wrap: wrap; gap: 10px; }
.miss {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
}
.miss-key { font-size: 18px; font-weight: 600; }

.buttons { display: flex; gap: 8px; justify-content: center; }
</style>
