import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCategory,
  createText,
  getText,
  listCategories,
  listTexts,
  removeCategory,
  resetMockLibrary,
} from './library'

const ownText = (categoryId: string, sub: string) =>
  createText({ title: 'mine', content: 'hello', categoryId, sub })

describe('mock library: deleting categories', () => {
  beforeEach(() => {
    resetMockLibrary()
  })

  it('keeps the texts of a deleted top category and moves them to Uncategorised', () => {
    const { id } = createCategory({ level: 'top', name: 'Mine' })
    const text = ownText(id, 'Notes')

    removeCategory(id)

    const moved = listTexts().find((t) => t.id === text.id)
    expect(moved).toMatchObject({ categoryId: 'custom', category: 'Custom', sub: 'Uncategorised' })
    const home = listCategories().find((c) => c.id === 'custom')
    expect(home?.children.find((x) => x.id === moved?.subId)?.count).toBe(1)
    expect(listCategories().some((c) => c.id === id)).toBe(false)
  })

  it('keeps the texts of a deleted sub and moves them to Uncategorised', () => {
    const { id: top } = createCategory({ level: 'top', name: 'Mine' })
    const { id: sub } = createCategory({ level: 'sub', parentId: top, name: 'Notes' })
    const text = ownText(top, 'Notes')
    expect(text.subId).toBe(sub)

    removeCategory(sub)

    expect(listTexts().find((t) => t.id === text.id)).toMatchObject({
      categoryId: 'custom',
      sub: 'Uncategorised',
    })
    expect(listCategories().find((c) => c.id === top)?.children).toEqual([])
  })

  it('refuses to delete a built-in category or sub', () => {
    const before = listTexts().length
    expect(() => removeCategory('english')).toThrow()
    expect(() => removeCategory('Web')).toThrow()
    expect(listTexts()).toHaveLength(before)
    expect(listCategories().some((c) => c.id === 'english')).toBe(true)
  })
})

describe('mock library: practice texts', () => {
  beforeEach(() => {
    resetMockLibrary()
  })

  it('lists the practice texts of a category, in the order they were written', () => {
    const list = listTexts({ category: 'basic' })
    expect(list).toHaveLength(3)
    expect(list[0].categoryId).toBe('basic')
    expect(list.every((t) => t.content === undefined)).toBe(true)
  })

  it('narrows to the first topic, and has nothing for the others', () => {
    expect(listTexts({ category: 'basic', sub: 'Home row' })).toHaveLength(3)
    expect(listTexts({ category: 'basic', sub: 'Numbers' })).toEqual([])
  })

  it('gives a category without texts the custom ones', () => {
    const { id } = createCategory({ level: 'top', name: 'Mine' })
    expect(listTexts({ category: id }).map((t) => t.categoryId)).toEqual(['custom'])
  })

  it('returns the content of a practice text', () => {
    const [first] = listTexts({ category: 'basic' })
    expect(getText(first.id).content).toBe('asdf jkl; asdf jkl; fjdk slas dkfj gh')
  })

  it('returns a text you added with its own content, and a seeded one with its category first text', () => {
    const mine = createText({ title: 'mine', content: 'hello', categoryId: 'english', sub: 'Web' })
    expect(getText(mine.id).content).toBe('hello')
    const seeded = listTexts().find((t) => t.isBuiltIn && t.categoryId === 'chinese')!
    expect(getText(seeded.id)).toMatchObject({ id: seeded.id, categoryId: 'chinese' })
    expect(getText(seeded.id).content).toMatch(/打字練習/)
  })
})

describe('mock library: writing texts', () => {
  beforeEach(() => {
    resetMockLibrary()
  })

  it('cleans the content like the server, so every character can be typed', () => {
    const raw = '\r\n第一段。\t \r\n第二段。\rthird  \n\n'
    const text = createText({ title: 'mine', content: raw, categoryId: 'english', sub: 'Web' })

    expect(text.content).toBe('第一段。\n第二段。\nthird')
    expect(text.chars).toBe('第一段。\n第二段。\nthird'.length)
    expect(getText(text.id).content).toBe('第一段。\n第二段。\nthird')
  })
})
