/**
 * In-memory library for the web build: a copy of the fixtures that create,
 * rename and delete write into. A page reload restores the fixtures.
 */
import type { CategoryDto, CreateCategoryBody, CreateTextBody, SubCategoryDto, TextDto } from '../types'
import { normaliseContent } from '@/lib/normalise'
import { ApiError } from '../http'
import { CATEGORIES, PRACTICE_TEXTS, TEXTS } from './fixtures'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

let categories: CategoryDto[] = clone(CATEGORIES)
let texts: TextDto[] = clone(TEXTS)
let seq = 1000

/** Starts over from the fixtures. */
export function resetMockLibrary() {
  categories = clone(CATEGORIES)
  texts = clone(TEXTS)
  seq = 1000
}

export const listCategories = (): CategoryDto[] => clone(categories)

const withoutContent = ({ content: _content, ...rest }: TextDto): TextDto => rest

/** The kind of a category id: the stored category's kind, or the id itself for the built-in groups. */
const kindOf = (id: string): string => categories.find((c) => c.id === id)?.kind ?? id

/** The practice texts of one category kind; kinds without texts of their own use the custom group. */
function practiceOf(kind: string): TextDto[] {
  const own = PRACTICE_TEXTS.filter((t) => t.categoryId === kind)
  return own.length ? own : PRACTICE_TEXTS.filter((t) => t.categoryId === 'custom')
}

/** With a category (and sub), the practice texts of it; without, the library list. */
export const listTexts = (params: { category?: string; sub?: string } = {}): TextDto[] => {
  if (!params.category) return clone(texts).map(withoutContent)
  const list = practiceOf(kindOf(params.category)).filter((t) => !params.sub || t.subId === params.sub)
  return clone(list).map(withoutContent)
}

/** A library text keeps its own content; a seeded one has none, so it practises its category's first text. */
export const getText = (id: number): TextDto => {
  const practice = PRACTICE_TEXTS.find((x) => x.id === id)
  if (practice) return clone(practice)
  const t = texts.find((x) => x.id === id)
  if (!t) throw new Error('Text not found')
  if (t.content) return clone(t)
  return { ...clone(t), content: practiceOf(kindOf(t.categoryId))[0]?.content ?? '' }
}

export function createCategory(body: CreateCategoryBody): { id: string } {
  const id = String(++seq)
  if (body.level === 'top') {
    categories.push({
      id,
      name: body.name,
      color: body.color || '#d97757',
      layout: 'en',
      kind: 'custom',
      isBuiltIn: false,
      children: [],
    })
  } else {
    const parent = categories.find((c) => c.id === body.parentId)
    if (!parent) throw new Error('Category not found')
    parent.children.push({ id, name: body.name, count: 0, isBuiltIn: false })
  }
  return { id }
}

export function renameCategory(id: string, name: string) {
  for (const c of categories) {
    const target: { name: string } | undefined = c.id === id ? c : c.children.find((x) => x.id === id)
    if (!target) continue
    target.name = name
    texts = texts.map((t) =>
      t.categoryId === c.id
        ? { ...t, category: c.name, sub: c.children.find((x) => x.id === t.subId)?.name ?? t.sub }
        : t,
    )
    return
  }
}

export function removeCategory(id: string) {
  const top = categories.find((c) => c.id === id)
  const sub = categories.flatMap((c) => c.children).find((x) => x.id === id)
  if (top?.isBuiltIn || sub?.isBuiltIn) throw new ApiError('Built-in rows cannot be deleted', 409)

  const moved = texts.filter((t) => (top ? t.categoryId === id : t.subId === id))
  categories = categories.filter((c) => c.id !== id)
  for (const c of categories) c.children = c.children.filter((x) => x.id !== id)
  if (!moved.length) return

  const home = uncategorised()
  const homeSub = subFor(home, 'Uncategorised')
  for (const t of moved) {
    t.categoryId = home.id
    t.category = home.name
    t.subId = homeSub.id
    t.sub = homeSub.name
  }
  homeSub.count += moved.length
}

function subFor(parent: CategoryDto, name: string | undefined): SubCategoryDto {
  const wanted = (name || '').trim()
  const found = wanted
    ? parent.children.find((x) => x.name.toLowerCase() === wanted.toLowerCase())
    : parent.children[0]
  if (found) return found
  const sub: SubCategoryDto = { id: String(++seq), name: wanted || 'General', count: 0, isBuiltIn: false }
  parent.children.push(sub)
  return sub
}

function uncategorised(): CategoryDto {
  let custom = categories.find((c) => c.id === 'custom')
  if (!custom) {
    custom = {
      id: 'custom',
      name: 'Custom',
      color: '#c08552',
      layout: 'en',
      kind: 'custom',
      isBuiltIn: true,
      children: [],
    }
    categories.push(custom)
  }
  return custom
}

export function createText(body: CreateTextBody): TextDto {
  const parent = categories.find((c) => c.id === body.categoryId) ?? uncategorised()
  const sub = subFor(parent, parent.id === body.categoryId ? body.sub : 'Uncategorised')
  sub.count += 1
  // Cleaned like the server does on every write, so the text can be typed.
  const content = normaliseContent(body.content)
  const text: TextDto = {
    id: ++seq,
    title: body.title,
    category: parent.name,
    sub: sub.name,
    categoryId: parent.id,
    subId: sub.id,
    level: body.level?.startsWith('L') ? body.level : `L${body.level || 3}`,
    chars: content.length,
    best: null,
    lastPractisedAt: null,
    isBuiltIn: false,
    content,
  }
  texts.unshift(text)
  return clone(text)
}

export function removeText(id: number) {
  const t = texts.find((x) => x.id === id)
  if (!t) return
  texts = texts.filter((x) => x.id !== id)
  const sub = categories.find((c) => c.id === t.categoryId)?.children.find((x) => x.id === t.subId)
  if (sub) sub.count = Math.max(0, sub.count - 1)
}
