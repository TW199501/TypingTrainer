import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_CATS, FMAP, SHIFTED, SRS_DAYS, TEXTS, ZHUYIN, ZH_REV,
  type Finger,
} from '@/data/constants'
import type { BookEntry, Category, LayoutKind } from '@/data/types'
import { useLibraryStore } from './library'
import { useDictionaryStore } from './dictionary'
import { useSettingsStore } from './settings'

export interface ResetPatch {
  mode?: string
  sub?: string
  idx?: number
  reviewText?: string | null
  dictStart?: string
  armed?: boolean
  count?: number
}

const TIMED_SECONDS = 60

export const useSessionStore = defineStore('session', () => {
  const library = useLibraryStore()
  const dictionary = useDictionaryStore()
  const settings = useSettingsStore()

  /* ---------------------------------------------------------------- state */

  const mode = ref('basic')
  const sub = ref('')
  const idx = ref(0)

  const typed = ref('')
  const keystrokes = ref(0)
  const correctStrokes = ref(0)
  const errors = ref<Record<string, number>>({})
  const attempts = ref<Record<number, number>>({})
  const pressed = ref('')

  const startedAt = ref(0)
  const now = ref(0)
  const done = ref(false)
  const endedAt = ref(0)

  const count = ref(0)
  const armed = ref(false)
  const reviewText = ref<string | null>(null)

  /** Live IME buffer, shown as a bubble above the current cell. */
  const comp = ref('')
  const composing = ref(false)

  const book = ref<BookEntry[]>([
    { ch: ';', total: 14, box: 1, dueIn: 0 },
    { ch: '/', total: 11, box: 2, dueIn: 0 },
    { ch: 'z', total: 9, box: 2, dueIn: 1 },
    { ch: 'p', total: 7, box: 3, dueIn: 3 },
    { ch: 'x', total: 6, box: 4, dueIn: 6 },
  ])

  // Stats / leaderboard scopes
  const statsLang = ref<'en' | 'zh'>('en')
  const boardLang = ref<'en' | 'zh'>('en')
  const scope = ref<'self' | 'social'>('self')
  const period = ref<'daily' | 'weekly'>('daily')

  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let countdown: ReturnType<typeof setInterval> | undefined
  let clock: ReturnType<typeof setInterval> | undefined

  /* ------------------------------------------------------------- derived */

  const cat = computed<Category>(
    () => library.categories.find((c) => c.id === mode.value) || library.categories[0] || DEFAULT_CATS[0],
  )
  const layout = computed<LayoutKind>(() => cat.value.layout || 'en')
  const subName = computed(
    () => (cat.value.children.find((x) => x.id === sub.value) || cat.value.children[0])?.name || '',
  )

  const isWord = computed(() => cat.value.kind === 'bilingual' && !reviewText.value)
  const cellMode = computed(() => layout.value === 'zh' || layout.value === 'zhuyin')
  const isZh = computed(() => layout.value === 'zh')

  const dictList = computed(() => dictionary.listFor(subName.value, dictionary.start))

  const target = computed(() => {
    if (reviewText.value) return reviewText.value
    if (cat.value.kind === 'bilingual') {
      return dictList.value.map((d) => d.zh.split('；')[0] + ' ' + d.w).join('　')
    }
    const g = TEXTS[cat.value.kind] || TEXTS.custom
    return g.items[idx.value % g.items.length]
  })

  const limit = computed(() => (cat.value.kind === 'timed' ? TIMED_SECONDS : 0))
  const elapsedMs = computed(() => {
    if (!startedAt.value) return 0
    return (done.value ? endedAt.value : now.value) - startedAt.value
  })

  const norm = (x: string | undefined) =>
    settings.ignoreWidth && x
      ? x.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')
      : x
  const eq = (a: string | undefined, b: string | undefined) => norm(a) === norm(b)

  const correctChars = computed(
    () => typed.value.split('').filter((c, i) => eq(c, target.value[i])).length,
  )
  const wpm = computed(() =>
    elapsedMs.value > 900 ? Math.max(0, Math.round((correctChars.value / 5) / (elapsedMs.value / 60000))) : 0)
  const cpm = computed(() =>
    elapsedMs.value > 900 ? Math.max(0, Math.round(correctChars.value / (elapsedMs.value / 60000))) : 0)
  /** Chinese is scored per character (CPM); everything else per five characters (WPM). */
  const speed = computed(() => (isZh.value ? cpm.value : wpm.value))
  const speedUnit = computed(() => (isZh.value ? '字/分' : 'WPM'))

  const accuracy = computed(() =>
    keystrokes.value ? Math.round((correctStrokes.value / keystrokes.value) * 1000) / 10 : 100)
  const accColor = computed(() =>
    accuracy.value >= 97 ? '#8a9a5b' : accuracy.value >= 92 ? '#c4922f' : '#bc4b3c')

  const remain = computed(() =>
    limit.value ? Math.max(0, limit.value - Math.floor(elapsedMs.value / 1000)) : 0)
  const progress = computed(
    () => Math.round((typed.value.length / Math.max(1, target.value.length)) * 100) + '%')

  const nextRaw = computed<string | undefined>(() => target.value[typed.value.length])
  const nextKey = computed(() => {
    const raw = nextRaw.value
    if (!raw) return ''
    if (raw === ' ') return 'space'
    if (layout.value === 'zh') return ''
    if (layout.value === 'zhuyin') return ZH_REV[raw] || ''
    return SHIFTED[raw] || raw.toLowerCase()
  })
  const nextFinger = computed<Finger | undefined>(() => FMAP[nextKey.value])

  const topErrors = computed(() =>
    Object.entries(errors.value)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, c]) => ({ key: k === ' ' ? 'Space' : k, count: c })))

  const errorCount = computed(() => Object.values(errors.value).reduce((a, b) => a + b, 0))
  const dueList = computed(() => book.value.filter((b) => b.dueIn <= 0))

  const statusHint = computed(() =>
    done.value ? 'Done' : startedAt.value ? 'Typing' : count.value > 0 ? 'Counting down' : 'Ready')
  const textCategory = computed(() => (reviewText.value ? 'Error review' : cat.value.name))
  const textMeta = computed(() =>
    reviewText.value
      ? 'Your missed keys, four times each'
      : (TEXTS[cat.value.kind] || TEXTS.custom).meta)

  /* ------------------------------------------------------------- actions */

  function press(id: string) {
    pressed.value = id
    clearTimeout(pressTimer)
    pressTimer = setTimeout(() => { pressed.value = '' }, 130)
  }

  function reset(patch: ResetPatch = {}) {
    typed.value = ''
    keystrokes.value = 0
    correctStrokes.value = 0
    errors.value = {}
    attempts.value = {}
    pressed.value = ''
    count.value = patch.count ?? 0
    armed.value = patch.armed ?? false
    reviewText.value = patch.reviewText ?? null
    startedAt.value = 0
    now.value = 0
    done.value = false
    endedAt.value = 0
    comp.value = ''
    composing.value = false

    if (patch.mode !== undefined) mode.value = patch.mode
    if (patch.sub !== undefined) sub.value = patch.sub
    if (patch.idx !== undefined) idx.value = patch.idx
    if (patch.dictStart !== undefined) dictionary.start = patch.dictStart
  }

  /** Every run opens with a 3-2-1 countdown; input stays locked until it ends. */
  function startRun() {
    clearInterval(countdown)
    reset({ armed: false, count: 3 })
    countdown = setInterval(() => {
      const n = count.value - 1
      if (n <= 0) {
        clearInterval(countdown)
        count.value = 0
        armed.value = true
      } else {
        count.value = n
      }
    }, 1000)
  }

  function pickCategory(c: Category) {
    reset({ mode: c.id, sub: c.children[0]?.id || '', idx: 0 })
  }
  function pickTopic(topicId: string, i: number) {
    reset({ sub: topicId, idx: i })
  }
  function nextText() {
    reset({ idx: idx.value + 1 })
  }

  function mergeBook() {
    const next = book.value.map((b) => ({ ...b }))
    Object.entries(errors.value).forEach(([ch, n]) => {
      const hit = next.find((b) => b.ch === ch)
      if (hit) {
        hit.total += n
        hit.box = 1
        hit.dueIn = SRS_DAYS[0]
      } else {
        next.push({ ch, total: n, box: 1, dueIn: SRS_DAYS[0] })
      }
    })
    book.value = next.sort((a, b) => a.dueIn - b.dueIn || b.total - a.total)
  }

  function finish() {
    done.value = true
    endedAt.value = Date.now()
    mergeBook()
  }

  /** Builds a drill out of the keys missed in the last run. */
  function startReview() {
    const list = Object.entries(errors.value)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k)
    const text = list.map((k) => (k === ' ' ? '_' : k).repeat(4)).join(' ')
    reset({ reviewText: text || null })
  }

  /** Drills only the error-book keys due today, then pushes them up a box. */
  function startDueReview() {
    const due = dueList.value
    if (!due.length) return
    reset({ reviewText: due.map((b) => (b.ch === ' ' ? '_' : b.ch).repeat(4)).join(' ') })
    book.value = book.value.map((b) =>
      b.dueIn <= 0
        ? { ...b, box: Math.min(SRS_DAYS.length, b.box + 1), dueIn: SRS_DAYS[Math.min(SRS_DAYS.length - 1, b.box)] }
        : b)
  }

  /* -------------------------------------------------------- typing engine */

  /** Physical keystroke. Returns true when the event was consumed. */
  function handleKey(e: KeyboardEvent, onPractice: boolean) {
    if (e.metaKey || e.ctrlKey) return false
    if (e.altKey) return false
    if (!onPractice || done.value || count.value > 0) return false
    // Timed runs only accept input after Start.
    if (limit.value && !startedAt.value && !armed.value) return false

    const lay = layout.value
    const t = target.value

    // Chinese goes through the IME input; here we only mirror the physical key.
    if (lay === 'zh') {
      const k = e.key === ' ' ? 'space'
        : e.key === 'Backspace' ? 'backspace'
          : e.key === 'Enter' ? 'enter' : e.key.toLowerCase()
      if (k.length === 1 || k === 'space' || k === 'backspace' || k === 'enter') press(k)
      return false
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      press('backspace')
      typed.value = typed.value.slice(0, -1)
      return true
    }
    if (e.key === 'Tab' || e.key === ' ') e.preventDefault()

    let ch = e.key === 'Enter' ? '\n' : e.key
    if (lay === 'zhuyin') {
      const sym = ZHUYIN[e.key.toLowerCase()]
      if (!sym) return false
      ch = sym
    }
    if (ch.length !== 1) return false

    press(e.key === ' ' ? 'space' : e.key.toLowerCase())

    const i = typed.value.length
    if (i >= t.length) return true

    const ok = eq(ch, t[i])
    if (!ok) {
      attempts.value = { ...attempts.value, [i]: (attempts.value[i] || 0) + 1 }
      errors.value = { ...errors.value, [t[i]]: (errors.value[t[i]] || 0) + 1 }
    }
    // With "count punctuation" off, punctuation misses are logged but not scored.
    const punctSkip = !ok && !settings.countPunct && /[^\w\s一-鿿ㄅ-ㄩ]/.test(t[i] || '')

    if (!startedAt.value) startedAt.value = Date.now()
    now.value = Date.now()

    if (settings.strict && !ok) {
      keystrokes.value += punctSkip ? 0 : 1
      return true
    }

    keystrokes.value += punctSkip ? 0 : 1
    if (ok) correctStrokes.value += 1
    typed.value = typed.value + ch
    if (typed.value.length >= t.length) finish()
    return true
  }

  /** Shared by the IME input's change and compositionend handlers. */
  function applyImeValue(raw: string) {
    const t = target.value
    const v = (raw || '').slice(0, t.length)
    const grew = v.length > typed.value.length
    const nextErrors = { ...errors.value }
    let correct = 0
    for (let i = 0; i < v.length; i++) {
      if (eq(v[i], t[i])) correct++
      else if (grew) nextErrors[t[i]] = (nextErrors[t[i]] || 0) + 1
    }
    errors.value = nextErrors
    typed.value = v
    keystrokes.value = Math.max(keystrokes.value, v.length)
    correctStrokes.value = correct
    if (!startedAt.value) startedAt.value = Date.now()
    now.value = Date.now()
    if (v.length >= t.length) finish()
  }

  function onCompStart() {
    comp.value = ''
    composing.value = true
  }
  function onCompUpdate(e: CompositionEvent) {
    comp.value = e.data || ''
  }
  function onCompEnd(e: CompositionEvent) {
    comp.value = ''
    composing.value = false
    applyImeValue((e.target as HTMLInputElement)?.value || '')
  }
  function onIme(e: Event) {
    // Mid-composition input events are noise: the bubble already shows them.
    if (composing.value) return
    applyImeValue((e.target as HTMLInputElement).value || '')
  }

  /* ----------------------------------------------------------------- clock */

  function startClock() {
    clock = setInterval(() => {
      if (startedAt.value && !done.value) {
        now.value = Date.now()
        if (limit.value && remain.value === 0) finish()
      }
    }, 200)
  }
  function stopClock() {
    clearInterval(clock)
    clearInterval(countdown)
    clearTimeout(pressTimer)
  }

  return {
    // state
    mode, sub, idx, typed, keystrokes, correctStrokes, errors, attempts, pressed,
    startedAt, now, done, endedAt, count, armed, reviewText, comp, composing, book,
    statsLang, boardLang, scope, period,
    // derived
    cat, layout, subName, isWord, cellMode, isZh, dictList, target, limit, elapsedMs,
    correctChars, wpm, cpm, speed, speedUnit, accuracy, accColor, remain, progress,
    nextRaw, nextKey, nextFinger, topErrors, errorCount, dueList, statusHint,
    textCategory, textMeta,
    // actions
    eq, press, reset, startRun, pickCategory, pickTopic, nextText, mergeBook,
    startReview, startDueReview, handleKey, onIme, onCompStart, onCompUpdate, onCompEnd,
    startClock, stopClock,
  }
})
