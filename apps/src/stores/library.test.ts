import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  categories: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
  texts: { list: vi.fn(), create: vi.fn(), import: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/api', async (orig) => ({ ...(await orig<typeof import('@/api')>()), api }))
const message = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }))
vi.mock('ant-design-vue', () => ({ message }))

import { ApiError, type CategoryDto, type TextDto } from '@/api'
import { i18n } from '@/i18n'
import { CATEGORIES, TEXTS } from '@/api/mock/fixtures'
import { useLibraryStore } from './library'
import { useSessionStore } from './session'

const cats = (): CategoryDto[] => JSON.parse(JSON.stringify(CATEGORIES))
const texts = (): TextDto[] => JSON.parse(JSON.stringify(TEXTS))

async function loaded() {
  const library = useLibraryStore()
  await library.load()
  vi.clearAllMocks()
  api.categories.list.mockResolvedValue(cats())
  api.texts.list.mockResolvedValue(texts())
  return library
}

describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.categories.list.mockResolvedValue(cats())
    api.texts.list.mockResolvedValue(texts())
  })

  it('creates a top category through the API and reloads the tree', async () => {
    const library = await loaded()
    api.categories.create.mockResolvedValue({ id: '42' })
    const after = cats()
    after.push({
      id: '42',
      name: 'Mine',
      color: '#fff',
      layout: 'en',
      kind: 'custom',
      isBuiltIn: false,
      children: [],
    })
    api.categories.list.mockResolvedValue(after)

    library.catModal = { level: 'top', parent: '', name: '  Mine ' }
    await library.submitCat()

    expect(api.categories.create).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'top', name: 'Mine' }),
    )
    expect(library.categories[library.categories.length - 1].id).toBe('42')
    expect(library.expanded['42']).toBe(true)
    expect(library.catModal).toBeNull()
  })

  it('renames a topic by its own id', async () => {
    const library = await loaded()
    await library.commitRename('english', 'Web', 'Web 2')
    expect(api.categories.rename).toHaveBeenCalledWith('Web', 'Web 2')
  })

  it('restores the old name when the rename is blank', async () => {
    const library = await loaded()
    await library.commitRename('english', null, '   ')
    expect(api.categories.rename).not.toHaveBeenCalled()
    expect(library.byId('english')?.name).toBe('English')
  })

  it('shows the error and keeps the list when a save fails', async () => {
    const library = await loaded()
    api.texts.create.mockRejectedValue(new ApiError('boom', 500))
    library.draft = 'hello world'
    const before = library.texts.length

    await library.saveDraft()

    expect(message.error).toHaveBeenCalledOnce()
    expect(library.texts).toHaveLength(before)
    expect(library.draft).toBe('hello world')
  })

  it('reports the failed files and keeps the dialog open', async () => {
    const library = await loaded()
    api.texts.import.mockRejectedValue(new ApiError('bad', 400, ['b.txt']))
    library.importOpen = true
    library.importFiles = [
      { name: 'a.txt', ext: 'TXT', size: '1 B', text: 'a', note: '' },
      { name: 'b.txt', ext: 'TXT', size: '1 B', text: '', note: '' },
    ]

    await library.confirmImport()

    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('b.txt'))
    expect(library.importOpen).toBe(true)
    expect(library.importFiles).toHaveLength(2)
  })

  it('sends no category for a manual import', async () => {
    const library = await loaded()
    api.texts.import.mockResolvedValue([])
    library.importMode = 'manual'
    library.importFiles = [{ name: 'a.txt', ext: 'TXT', size: '1 B', text: 'hello', note: '' }]

    await library.confirmImport()

    const body = api.texts.import.mock.calls[0][0][0]
    expect(body).toEqual({ title: 'a', content: 'hello', fileName: 'a.txt' })
    expect(body).not.toHaveProperty('categoryId')
    expect(library.importOpen).toBe(false)
  })

  it('treats a write as saved when only the reload after it fails', async () => {
    const library = await loaded()
    api.texts.create.mockResolvedValue({})
    api.texts.list.mockRejectedValue(new Error('offline'))
    library.composerOpen = true
    library.draft = 'hello world'

    await library.saveDraft()

    expect(message.error).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith(i18n.global.t('library.reloadFailed'))
    expect(library.draft).toBe('')
    expect(library.composerOpen).toBe(false)
  })

  it('closes the import dialog when the import succeeds but the reload fails', async () => {
    const library = await loaded()
    api.texts.import.mockResolvedValue([])
    api.categories.list.mockRejectedValue(new Error('offline'))
    library.importOpen = true
    library.importFiles = [{ name: 'a.txt', ext: 'TXT', size: '1 B', text: 'hello', note: '' }]

    await library.confirmImport()

    expect(message.error).not.toHaveBeenCalled()
    expect(library.importOpen).toBe(false)
    expect(library.importFiles).toHaveLength(0)
  })

  it('ignores a second click while a write is pending', async () => {
    const library = await loaded()
    let done!: (v: { id: string }) => void
    const gate = new Promise<{ id: string }>((r) => (done = r))
    for (const fn of [api.texts.create, api.texts.import, api.categories.create, api.texts.remove]) {
      fn.mockReturnValue(gate)
    }
    library.draft = 'hello world'
    library.importFiles = [{ name: 'a.txt', ext: 'TXT', size: '1 B', text: 'hello', note: '' }]
    library.catModal = { level: 'top', parent: '', name: 'Mine' }

    const calls = [
      library.saveDraft(),
      library.saveDraft(),
      library.confirmImport(),
      library.submitCat(),
      library.removeText(3),
      library.removeGroup('42'),
    ]
    done({ id: '42' })
    await Promise.all(calls)

    expect(api.texts.create).toHaveBeenCalledOnce()
    expect(api.texts.import).not.toHaveBeenCalled()
    expect(api.categories.create).not.toHaveBeenCalled()
    expect(api.texts.remove).not.toHaveBeenCalled()
    expect(api.categories.remove).not.toHaveBeenCalled()
    expect(library.saving).toBe(false)
  })

  it('removes a text through the API and reloads', async () => {
    const library = await loaded()
    await library.removeText(3)
    expect(api.texts.remove).toHaveBeenCalledWith(3)
    expect(api.texts.list).toHaveBeenCalled()
  })

  it('practice falls back to the first category after its category is deleted', async () => {
    const library = await loaded()
    const session = useSessionStore()
    session.reset({ mode: 'english', idx: 0 })
    expect(session.cat.id).toBe('english')

    api.categories.list.mockResolvedValue(cats().filter((c) => c.id !== 'english'))
    await library.removeGroup('english')

    expect(api.categories.remove).toHaveBeenCalledWith('english')
    expect(session.cat.id).toBe(library.categories[0].id)
  })
})
