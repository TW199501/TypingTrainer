import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { api, type TextDto } from '@/api'
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
    session.setText({ id: 1, content: 'asdf jkl; asdf jkl; fjdk slas dkfj gh' })
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
    session.setText({ id: 2, content: 'ㄅㄆㄇㄈ ㄉㄊㄋㄌ' })
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

describe('line breaks', () => {
  let session: ReturnType<typeof useSessionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.categories = CATEGORIES.map((c) => ({ ...c, children: c.children.slice() })) as Category[]
    session = useSessionStore()
  })

  it('drops line breaks from a Chinese target and remembers where they were', () => {
    session.reset({ mode: 'chinese', idx: 0 })
    session.setText({ id: 1, content: '第一段。\n第二段。' })

    expect(session.target).toBe('第一段。第二段。')
    expect(session.breaks).toEqual([4])

    session.applyImeValue('第一段。第二段')
    expect(session.done).toBe(false)
    session.applyImeValue('第一段。第二段。')
    expect(session.done).toBe(true)
    expect(session.errors).toEqual({})
  })

  it('drops line breaks from a bopomofo target too', () => {
    session.reset({ mode: 'zhuyin', idx: 0 })
    session.setText({ id: 2, content: 'ㄅㄆ\n\nㄇㄈ' })

    expect(session.target).toBe('ㄅㄆㄇㄈ')
    expect(session.breaks).toEqual([2, 2])
    type(session, '1qaz')
    expect(session.done).toBe(true)
  })

  it('keeps line breaks in a latin target, typed with Enter', () => {
    session.reset({ mode: 'english', idx: 0 })
    session.setText({ id: 3, content: 'ab\ncd' })

    expect(session.target).toBe('ab\ncd')
    expect(session.breaks).toEqual([])
    type(session, 'ab')
    session.handleKey(key('Enter'), true)
    type(session, 'cd')
    expect(session.done).toBe(true)
    expect(session.errors).toEqual({})
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

describe('practice text', () => {
  const dto = (id: number, categoryId: string, subId: string, content?: string): TextDto => ({
    id,
    title: `t${id}`,
    category: categoryId,
    sub: subId,
    categoryId,
    subId,
    level: 'L3',
    chars: content?.length ?? 0,
    best: null,
    lastPractisedAt: null,
    isBuiltIn: true,
    content,
  })

  let session: ReturnType<typeof useSessionStore>

  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.categories = CATEGORIES.map((c) => ({ ...c, children: c.children.slice() })) as Category[]
    session = useSessionStore()
  })

  it('does not finish while the text is still loading', () => {
    session.setText(null)
    session.applyImeValue('a')
    expect(session.done).toBe(false)
    expect(session.handleKey(key('a'), true)).toBe(false)
    expect(session.typed).toBe('')
  })

  it('loads the first text of the picked topic', async () => {
    const list = vi
      .spyOn(api.texts, 'list')
      .mockResolvedValue([dto(11, 'english', 'Banking'), dto(12, 'english', 'Banking')])
    const get = vi.spyOn(api.texts, 'get').mockResolvedValue(dto(11, 'english', 'Banking', 'wire the money'))
    session.pickCategory(CATEGORIES.find((c) => c.id === 'english') as Category)
    await vi.waitFor(() => expect(session.text?.content).toBe('wire the money'))
    session.pickTopic('Banking', 0)
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ category: 'english', sub: 'Banking' }))
    await vi.waitFor(() => expect(session.textLoading).toBe(false))

    expect(get).toHaveBeenLastCalledWith(11)
    expect(session.target).toBe('wire the money')
  })

  it('takes the text at the topic index, wrapping round', async () => {
    vi.spyOn(api.texts, 'list').mockResolvedValue([dto(1, 'basic', 'a'), dto(2, 'basic', 'a')])
    const get = vi.spyOn(api.texts, 'get').mockImplementation(async (id) => dto(id, 'basic', 'a', `c${id}`))
    session.pickTopic('Top row', 3)
    await vi.waitFor(() => expect(session.text?.content).toBe('c2'))
    expect(get).toHaveBeenCalledWith(2)
  })

  it('falls back to the whole category when the topic is empty', async () => {
    const list = vi
      .spyOn(api.texts, 'list')
      .mockImplementation(async (p) => (p?.sub ? [] : [dto(7, 'basic', 'Home row')]))
    vi.spyOn(api.texts, 'get').mockResolvedValue(dto(7, 'basic', 'Home row', 'whole category'))
    session.pickTopic('Numbers', 0)
    await vi.waitFor(() => expect(session.target).toBe('whole category'))

    expect(list).toHaveBeenNthCalledWith(1, { category: 'basic', sub: 'Numbers' })
    expect(list).toHaveBeenNthCalledWith(2, { category: 'basic' })
  })

  it('keeps no text when the category has none', async () => {
    vi.spyOn(api.texts, 'list').mockResolvedValue([])
    session.setText({ id: 1, content: 'old' })
    session.pickTopic('Numbers', 0)
    await vi.waitFor(() => expect(session.textLoading).toBe(false))
    expect(session.text).toBeNull()
  })

  it('ignores a load that a newer choice has overtaken', async () => {
    let release!: (v: TextDto[]) => void
    vi.spyOn(api.texts, 'list')
      .mockReturnValueOnce(new Promise((r) => (release = r)))
      .mockResolvedValue([dto(2, 'basic', 'Home row')])
    vi.spyOn(api.texts, 'get').mockImplementation(async (id) => dto(id, 'basic', 'Home row', `c${id}`))
    session.pickTopic('Numbers', 0)
    session.pickTopic('Symbols', 0)
    await vi.waitFor(() => expect(session.text?.content).toBe('c2'))
    release([dto(1, 'basic', 'Numbers')])
    await new Promise((r) => setTimeout(r, 0))
    expect(session.text?.content).toBe('c2')
  })

  it('startText practises the chosen text in its own category', async () => {
    vi.spyOn(api.texts, 'get').mockResolvedValue(dto(5, 'zhuyin', 'Initials', 'ㄅㄆㄇㄈ'))
    await session.startText(5)

    expect(session.mode).toBe('zhuyin')
    expect(session.sub).toBe('Initials')
    expect(session.text).toEqual({ id: 5, content: 'ㄅㄆㄇㄈ' })
    expect(session.target).toBe('ㄅㄆㄇㄈ')
  })

  it('startCategory loads a text of the new category, not the previous one', async () => {
    const list = vi
      .spyOn(api.texts, 'list')
      .mockImplementation(async (p) => (p?.category === 'chinese' ? [dto(9, 'chinese', 'Finance')] : []))
    vi.spyOn(api.texts, 'get').mockResolvedValue(dto(9, 'chinese', 'Finance', '打字練習'))
    session.setText({ id: 1, content: 'asdf jkl;' })
    await session.startCategory('chinese')
    await vi.waitFor(() => expect(session.target).toBe('打字練習'))

    expect(session.mode).toBe('chinese')
    expect(session.sub).toBe('')
    expect(list).toHaveBeenCalledWith({ category: 'chinese' })
  })

  it('startCategory leaves the vocabulary drill to the dictionary', async () => {
    const list = vi.spyOn(api.texts, 'list')
    await session.startCategory('bilingual', 'Banking')
    expect(list).not.toHaveBeenCalled()
    expect(session.mode).toBe('bilingual')
    expect(session.sub).toBe('Banking')
  })
})
