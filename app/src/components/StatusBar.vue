<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const clockLabel = computed(() => (session.limit ? 'Time left' : 'Elapsed'))
const clockValue = computed(() =>
  session.limit ? session.remain + 's' : Math.floor(session.elapsedMs / 1000) + 's')
</script>

<template>
  <div class="statusbar">
    <div class="stat">
      <span class="label">{{ session.speedUnit }}</span>
      <span class="value value--primary nums">{{ session.speed }}</span>
    </div>
    <div class="sep" />
    <div class="stat">
      <span class="label">Accuracy</span>
      <span class="value nums" :style="{ color: session.accColor }">{{ session.accuracy }}%</span>
    </div>
    <div class="sep" />
    <div class="stat">
      <span class="label">{{ clockLabel }}</span>
      <span class="value nums">{{ clockValue }}</span>
    </div>
    <div class="progress">
      <div class="bar"><i :style="{ width: session.progress, transition: 'width 0.1s linear' }" /></div>
      <span class="pct nums">{{ session.progress }}</span>
    </div>
    <div class="tail">
      <a-tag color="volcano">{{ session.textCategory }}</a-tag>
      <span>{{ session.statusHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.statusbar {
  height: 48px;
  flex-shrink: 0;
  background: var(--surface);
  border-top: 1px solid var(--line);
  box-shadow: 0 -1px 2px 0 rgba(0, 0, 0, 0.03);
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 24px;
}
.stat { display: flex; align-items: baseline; gap: 6px; }
.label { font-size: 12px; color: var(--text-3); }
.value { font-size: 20px; line-height: 28px; font-weight: 600; }
.value--primary { color: var(--primary); }
.sep { width: 1px; height: 24px; background: var(--line); }
.progress { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; }
.pct { font-size: 14px; color: var(--text-2); width: 44px; text-align: right; }
.tail {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
}
.tail :deep(.ant-tag) { margin-inline-end: 0; }
</style>
