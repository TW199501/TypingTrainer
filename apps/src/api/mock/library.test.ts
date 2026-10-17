import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCategory,
  createText,
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
