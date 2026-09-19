<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ZH_REV } from '@/data/constants'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'
import { useElementSize } from '@/composables/useElementSize'
import { useViewport } from '@/composables/useViewport'
import VirtualKeyboard from '@/components/VirtualKeyboard.vue'

const { t } = useI18n()
const session = useSessionStore()
const settings = useSettingsStore()
const library = useLibraryStore()
const { vh } = useViewport()

const colRef = ref<HTMLElement | null>(null)
const barRef = ref<HTMLElement | null>(null)
const boxRef = ref<HTMLElement | null>(null)
const imeRef = ref<HTMLInputElement | null>(null)

const { height: colH } = useElementSize(colRef, 'client')
const { height: barH } = useElementSize(barRef, 'offset')

/* ------------------------------------------------------------ measurements */

/** Vocabulary and cell-based modes carry more chrome, so they reserve more. */
const textFloor = computed(() => (session.isWord ? 210 : session.cellMode ? 200 : 120))

const kbHeight = computed(() => {
  const available = colH.value ? colH.value - (barH.value || 34) - 20 : vh.value - 176
  return Math.max(120, Math.min(340, available - textFloor.value))
})
const showKeyboard = computed(() => settings.kb && kbHeight.value >= 130)
const kbHint = computed(() => kbHeight.value >= 190)
const legendVisible = computed(() => vh.value >= 640)

const typeFontSize = computed(() =>
  settings.fontSize === 'S'
    ? 'clamp(15px,2.1vh,19px)'
    : settings.fontSize === 'L'
      ? 'clamp(22px,3.2vh,30px)'
      : 'clamp(18px,2.6vh,24px)',
)

/* ------------------------------------------------------------- characters */

interface CharCell {
  ch: string
  color: string
  bg: string
  deco: string
  anim: string
  shadow: string
  cur: boolean
  cell: boolean
}

const chars = computed<CharCell[]>(() => {
  const t = session.target
  const cell = session.cellMode
  const idle = !session.startedAt && session.count === 0
  return t.split('').map((ch, i) => {
    const typedCh = session.typed[i]
    let color = '#8c877c'
    let bg = 'transparent'
    let deco = 'none'
    if (typedCh !== undefined) {
      if (session.eq(typedCh, ch)) color = '#1f1e1d'
      else {
        color = '#bc4b3c'
        bg = 'rgba(188,75,60,0.12)'
        deco = 'underline'
      }
    }
    const cur = i === session.typed.length
    return {
      ch: ch === ' ' ? ' ' : ch,
      color,
      bg,
      deco,
      cur,
      cell,
      anim:
        cur && idle ? (cell ? 'caretCell 1s steps(1) infinite' : 'caretPulse 1s steps(1) infinite') : 'none',
      shadow: cur
        ? cell
          ? 'inset 0 -2px 0 0 #d97757'
          : 'inset 2px 0 0 0 #d97757'
        : cell
          ? 'inset 0 -1px 0 0 #e6ded2'
          : 'none',
    }
  })
})

/* ------------------------------------------------------------- toolbar */

const activeSub = computed(() => session.sub || session.cat.children[0]?.id || '')

const startLabel = computed(() =>
  session.count > 0 ? String(session.count) : session.startedAt ? t('practice.restart') : t('practice.start'),
)

/* -------------------------------------------------------- vocabulary head */

const prompt = computed(() => {
  if (!session.isWord) return null
  const l = session.dictList
  if (!l.length) return null
  let pos = 0
  let cur = l[0]
  let half: 'zh' | 'en' = 'zh'
  for (const d of l) {
    const zhW = d.zh.split('；')[0]
    const zhEnd = pos + zhW.length
    const enEnd = zhEnd + 1 + d.w.length
    if (session.typed.length <= enEnd) {
      cur = d
      half = session.typed.length <= zhEnd ? 'zh' : 'en'
      break
    }
    pos = enEnd + 1
  }
  const at = l.findIndex((d) => d.w === cur.w)
  return {
    zh: cur.zh.split('；')[0] + '　' + cur.w,
    ph: cur.ph,
    pos: cur.pos,
    progress:
      t('practice.vocabProgress', { index: at + 1, total: l.length }) +
      '　' +
      (half === 'zh' ? t('practice.chineseFirst') : t('practice.thenEnglish')),
  }
})

const textCategory = computed(() => (session.reviewText ? t('practice.errorReview') : session.cat.name))
const textMeta = computed(() =>
  session.metaKey ? t(`practice.meta.${session.metaKey}`) : t('practice.reviewMeta'),
)

/* -------------------------------------------------------------- miss hint */

const hintOpen = computed(() => (session.attempts[session.typed.length] || 0) >= 3 && !session.done)
const hintChar = computed(() => (session.nextRaw === ' ' ? t('status.space') : session.nextRaw || ''))
const hintText = computed(() => {
  const f = session.nextFinger
  if (!f) return ''
  const finger = t('practice.useFinger', { finger: t(`practice.fingers.${f}`) })
  // Bopomofo drills also name the latin key the symbol sits on.
  if (session.layout !== 'zhuyin' || !session.nextRaw) return finger
  return finger + t('practice.pressKey', { key: (ZH_REV[session.nextRaw] || '').toUpperCase() })
})

/* ---------------------------------------------------------------- effects */

/** Keep the character under the caret vertically centred in the text card. */
watch(
  () => [session.typed, session.target, session.comp],
  async () => {
    await nextTick()
    const box = boxRef.value
    const cell = box?.querySelector<HTMLElement>('.is-cur')
    if (!box || !cell || box.scrollHeight <= box.clientHeight) return
    const want = cell.offsetTop - (box.clientHeight - cell.offsetHeight) / 2
    const top = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, want))
    if (Math.abs(box.scrollTop - top) > 2) box.scrollTop = top
  },
)

// The IME field is uncontrolled so the browser keeps its composition buffer;
// it is only cleared when the run resets.
watch(
  () => session.typed,
  (v) => {
    const ime = imeRef.value
    if (ime && !session.composing && v === '' && ime.value !== '') ime.value = ''
  },
)

watch(
  () => session.layout,
  () => nextTick(() => imeRef.value?.focus()),
)
onMounted(() => nextTick(() => imeRef.value?.focus()))
</script>

<template>
  <div ref="colRef" class="page practice">
    <div ref="barRef" class="toolbar">
      <div class="pickers">
        <div class="picker-row">
          <span class="picker-label">{{ t('practice.category') }}</span>
          <div class="seg seg--wrap">
            <div
              v-for="c in library.categories"
              :key="c.id"
              class="seg-item seg-item--cat"
              :class="{ 'is-on': session.mode === c.id }"
              @click="session.pickCategory(c)"
            >
              <span class="dot" :style="{ background: c.color }" />{{ c.name }}
            </div>
          </div>
        </div>
        <div v-if="session.cat.children.length" class="picker-row">
          <span class="picker-label">{{ t('practice.topic') }}</span>
          <div class="topics">
            <div
              v-for="(x, i) in session.cat.children"
              :key="x.id"
              class="pill"
              :style="
                activeSub === x.id
                  ? { background: session.cat.color, color: '#fff', borderColor: session.cat.color }
                  : undefined
              "
              @click="session.pickTopic(x.id, i)"
            >
              {{ x.name }}<span style="opacity: 0.7">{{ x.count }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="actions">
        <div class="btn-slot" style="width: 96px" @click="session.startRun()">
          <a-button>{{ startLabel }}</a-button>
        </div>
        <div class="btn-slot" style="width: 96px" @click="session.nextText()">
          <a-button type="primary">{{ t('practice.nextText') }}</a-button>
        </div>
      </div>
    </div>

    <div class="text-card" :style="{ minHeight: textFloor + 'px' }">
      <div class="text-head">
        <div class="text-head-left">
          <a-tag color="volcano">{{ textCategory }}</a-tag>
          <span class="dim-2">{{ session.subName }}</span>
          <span class="dim">{{ textMeta }}</span>
        </div>
        <span class="small dim">{{ t('practice.timerHint') }}</span>
      </div>

      <div v-if="session.count > 0" class="countdown">
        <span class="countdown-value nums">{{ session.count }}</span>
        <span class="small dim">{{ t('practice.getReady') }}</span>
      </div>

      <div v-if="prompt" class="vocab">
        <span class="small dim">{{ prompt.progress }}</span>
        <span class="vocab-zh">{{ prompt.zh }}</span>
        <span class="vocab-meta">{{ prompt.pos }} {{ prompt.ph }}</span>
      </div>

      <div
        ref="boxRef"
        class="chars"
        :style="{ textAlign: session.isWord ? 'center' : 'left', fontSize: typeFontSize }"
      >
        <span
          v-for="(c, i) in chars"
          :key="i"
          class="char"
          :class="{ 'char--cell': c.cell, 'is-cur': c.cur }"
          :style="{
            animation: c.anim,
            color: c.color,
            background: c.bg,
            boxShadow: c.shadow,
            textDecoration: c.deco,
          }"
          >{{ c.ch }}<span v-if="c.cur && session.comp" class="comp">{{ session.comp }}</span></span
        >
      </div>

      <input
        v-if="session.layout === 'zh'"
        ref="imeRef"
        class="ime"
        aria-label="Chinese IME"
        @input="session.onIme"
        @compositionstart="session.onCompStart"
        @compositionupdate="session.onCompUpdate"
        @compositionend="session.onCompEnd"
      />

      <div v-if="hintOpen" class="miss-hint">
        <span class="miss-count">{{ t('practice.misses', { count: 3 }) }}</span>
        <span class="miss-text">
          {{ t('practice.typeThis') }} <span class="miss-char">{{ hintChar }}</span
          >{{ hintText }}
        </span>
      </div>
    </div>

    <VirtualKeyboard
      v-if="showKeyboard"
      :height="kbHeight"
      :show-hint="kbHint"
      :legend-visible="legendVisible"
    />
  </div>
</template>

<style scoped>
.practice {
  gap: 10px;
}

.toolbar {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  flex-shrink: 0;
}
.pickers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.picker-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  flex-shrink: 0;
  width: 56px;
}
.seg--wrap {
  min-width: 0;
  flex-wrap: wrap;
}
.seg-item--cat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 13px;
  flex-shrink: 0;
}
.topics {
  display: flex;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  align-self: flex-start;
}

.text-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 16px 28px 18px;
  box-shadow: var(--card-shadow);
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.text-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.text-head-left {
  display: flex;
  gap: 8px;
  align-items: center;
}
.text-head-left :deep(.ant-tag) {
  margin-inline-end: 0;
}

.countdown {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.countdown-value {
  font-size: 72px;
  line-height: 80px;
  font-weight: 600;
  color: var(--primary);
}

.vocab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 4px 0 10px;
  flex-shrink: 0;
}
.vocab-zh {
  font-size: 30px;
  line-height: 40px;
  font-weight: 600;
  color: var(--text);
}
.vocab-meta {
  font-size: 13px;
  color: var(--text-3);
}

.chars {
  font-family: var(--font-mono);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  letter-spacing: 0.2px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.char {
  position: relative;
  display: inline-block;
  border-radius: 3px;
  text-align: center;
  text-decoration-color: #bc4b3c;
  text-underline-offset: 6px;
}
/* Chinese and bopomofo drills get one boxed cell per character. */
.char--cell {
  margin: 0 3px 4px 0;
  padding: 0 2px;
  min-width: 1.35em;
}
/* .is-cur carries no styling — it marks the caret cell for the scroll-into-view watcher. */

.comp {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 2px);
  padding: 1px 8px;
  border-radius: 100px;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(217, 119, 87, 0.32);
}

.ime {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.miss-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(217, 119, 87, 0.08);
  flex-shrink: 0;
}
.miss-count {
  font-size: 12px;
  color: var(--primary-active);
  font-weight: 600;
  white-space: nowrap;
}
.miss-text {
  font-size: 13px;
  color: var(--text-2);
}
.miss-char {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  padding: 0 4px;
}
</style>
