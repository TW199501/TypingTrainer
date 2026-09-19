import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { CATEGORIES } from '@/api/mock/fixtures'
import type { Category } from '@/data/types'

/** A keydown the engine will accept. */
const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true })

function type(session: ReturnType<typeof useSessionStore>, text: string) {
  for (const ch of text) session.handleKey(key(ch), true)
}

describe('typing engine', () => {
  let session: ReturnType<typeof useSessionStore>
  let settings: ReturnType<typeof useSettingsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.categories = CATEGORIES.map((c) => ({ ...c, children: c.children.slice() })) as Category[]
    settings = useSettingsStore()
    session = useSessionStore()
    session.reset({ mode: 'basic', idx: 0 })
  })

  it('marks correct characters and counts strokes', () => {
    type(session, 'asdf')
    expect(session.typed).toBe('asdf')
    expect(session.correctStrokes).toBe(4)
    expect(session.keystrokes).toBe(4)
    expect(session.accuracy).toBe(100)
  })

  it('records the missed target character, not the key pressed', () => {
    type(session, 'axdf')
    expect(session.errors).toEqual({ s: 1 })
    expect(session.accuracy).toBe(75)
  })

  it('does not advance in strict mode until the right key comes', () => {
    settings.strict = true
    type(session, 'ax')
    expect(session.typed).toBe('a')
    type(session, 's')
    expect(session.typed).toBe('as')
  })

  it('backspace removes the last character', () => {
    type(session, 'as')
    session.handleKey(key('Backspace'), true)
    expect(session.typed).toBe('a')
  })

  it('ignores input while the countdown runs', () => {
    vi.useFakeTimers()
    session.startRun()
    type(session, 'a')
    expect(session.typed).toBe('')
    vi.advanceTimersByTime(3000)
    type(session, 'a')
    expect(session.typed).toBe('a')
    vi.useRealTimers()
  })

  it('logs keystrokes for server-side verification', () => {
    type(session, 'as')
    expect(session.keyLog.map((k) => k.k)).toEqual(['a', 's'])
    expect(session.keyLog.every((k) => k.ok)).toBe(true)
  })

  it('finishes when the whole text is typed', () => {
    type(session, session.target)
    expect(session.done).toBe(true)
    expect(session.progress).toBe('100%')
  })

  it('maps latin keys to bopomofo symbols', () => {
    session.reset({ mode: 'zhuyin', idx: 0 })
    expect(session.target.startsWith('ㄅㄆㄇㄈ')).toBe(true)
    type(session, '1qaz')
    expect(session.typed).toBe('ㄅㄆㄇㄈ')
    expect(session.correctStrokes).toBe(4)
  })

  it('scores Chinese runs in CPM and latin runs in WPM', () => {
    expect(session.speedUnitKey).toBe('wpm')
    session.reset({ mode: 'chinese' })
    expect(session.speedUnitKey).toBe('cpmUnit')
  })

  it('treats full-width and half-width as equal when asked to', () => {
    settings.ignoreWidth = true
    expect(session.eq('，', ',')).toBe(true)
    settings.ignoreWidth = false
    expect(session.eq('，', ',')).toBe(false)
  })

  it('keeps punctuation misses out of the score when counting is off', () => {
    settings.countPunct = false
    session.reset({ mode: 'basic', idx: 0 })
    type(session, 'asdf jkl')
    const before = session.keystrokes
    session.handleKey(key('x'), true) // target is ';'
    expect(session.keystrokes).toBe(before)
    expect(session.errors[';']).toBe(1)
  })
})

describe('error book', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.categories = CATEGORIES.map((c) => ({ ...c, children: c.children.slice() })) as Category[]
  })

  it('schedules new misses for tomorrow and resets known ones to box 1', () => {
    const session = useSessionStore()
    session.book = [{ ch: 'z', total: 3, box: 4, dueIn: 6 }]
    session.errors = { z: 2, q: 1 }
    session.mergeBook()

    const z = session.book.find((b) => b.ch === 'z')!
    expect(z.total).toBe(5)
    expect(z.box).toBe(1)
    expect(z.dueIn).toBe(1)
    expect(session.book.find((b) => b.ch === 'q')).toEqual({ ch: 'q', total: 1, box: 1, dueIn: 1 })
  })

  it('drills only the keys due today and promotes them', () => {
    const session = useSessionStore()
    session.book = [
      { ch: ';', total: 4, box: 1, dueIn: 0 },
      { ch: 'p', total: 2, box: 2, dueIn: 3 },
    ]
    session.startDueReview()

    expect(session.reviewText).toBe(';;;;')
    expect(session.book[0].box).toBe(2)
    expect(session.book[0].dueIn).toBe(2)
    expect(session.book[1].dueIn).toBe(3)
  })

  it('builds a review drill from the last run misses', () => {
    const session = useSessionStore()
    session.errors = { z: 3, ' ': 1 }
    session.startReview()
    expect(session.reviewText).toBe('zzzz ____')
  })
})
