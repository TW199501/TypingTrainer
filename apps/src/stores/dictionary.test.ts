import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ dictionary: { list: vi.fn(), import: vi.fn() } }))
vi.mock('@/api', async (orig) => ({ ...(await orig<typeof import('@/api')>()), api }))
const message = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('ant-design-vue', () => ({ message }))

import { ApiError, type DictEntryDto } from '@/api'
import { i18n } from '@/i18n'
import { useDictionaryStore, type DictFile } from './dictionary'

const t = i18n.global.t

const CSV = [
  'word,translation,phonetic,tag',
  'balance,餘額,/ˈbæləns/,Banking',
  'reconcile,對帳,/ˈrekənsaɪl/,Accounting',
  'remittance,匯款,/rɪˈmɪtns/,Banking',
].join('\n')

const file = (text = CSV): DictFile => ({
  name: 'words.csv',
  rows: text.split('\n').length - 1,
  cols: ['word', 'translation', 'phonetic', 'tag'],
  preview: [],
  text,
})

const entry = (id: number): DictEntryDto => ({
  id,
  word: `w${id}`,
  phonetic: '',
  pos: '',
  zh: '',
  topic: 'T',
  example: '',
  mastery: 0,
})

function withFile(text?: string) {
  const dictionary = useDictionaryStore()
  dictionary.file = file(text)
  dictionary.map = { w: 'word', zh: 'translation', ph: 'phonetic', cat: 'tag' }
  dictionary.importOpen = true
  return dictionary
}

describe('dictionary import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.dictionary.list.mockResolvedValue([entry(1), entry(2)])
  })

  it('imports every mapped row and reports added and skipped', async () => {
    api.dictionary.import.mockResolvedValue({ added: 2, skipped: 1 })
    const dictionary = withFile()
    dictionary.dedupe = false
    await dictionary.confirmImport()

    expect(api.dictionary.import).toHaveBeenCalledOnce()
    expect(api.dictionary.import).toHaveBeenCalledWith({
      skipDuplicates: false,
      words: [
        { word: 'balance', zh: '餘額', phonetic: '/ˈbæləns/', pos: '', topic: 'Banking', example: '' },
        {
          word: 'reconcile',
          zh: '對帳',
          phonetic: '/ˈrekənsaɪl/',
          pos: '',
          topic: 'Accounting',
          example: '',
        },
        { word: 'remittance', zh: '匯款', phonetic: '/rɪˈmɪtns/', pos: '', topic: 'Banking', example: '' },
      ],
    })
    expect(message.success).toHaveBeenCalledWith(t('dict.imported', { added: 2, skipped: 1 }))
    expect(dictionary.importOpen).toBe(false)
    expect(dictionary.file).toBeNull()
  })

  it('sends skipDuplicates as the dedupe switch says', async () => {
    api.dictionary.import.mockResolvedValue({ added: 3, skipped: 0 })
    const dictionary = withFile()
    dictionary.dedupe = true
    await dictionary.confirmImport()
    expect(api.dictionary.import.mock.calls[0][0].skipDuplicates).toBe(true)
  })

  it('reads the unmapped columns as empty and handles tab separated files', async () => {
    api.dictionary.import.mockResolvedValue({ added: 1, skipped: 0 })
    const dictionary = withFile('word\ttranslation\nbalance\t餘額')
    dictionary.map = { w: 'word', zh: 'translation', ph: '', cat: '' }
    await dictionary.confirmImport()
    expect(api.dictionary.import.mock.calls[0][0].words).toEqual([
      { word: 'balance', zh: '餘額', phonetic: '', pos: '', topic: '', example: '' },
    ])
  })

  it('reloads the word list after an import', async () => {
    api.dictionary.import.mockResolvedValue({ added: 2, skipped: 0 })
    const dictionary = withFile()
    await dictionary.confirmImport()
    expect(api.dictionary.list).toHaveBeenCalledOnce()
    expect(dictionary.entries.map((d) => d.id)).toEqual([1, 2])
  })

  it('does not import when no word column is mapped', async () => {
    const dictionary = withFile()
    dictionary.map = { ...dictionary.map, w: '' }
    await dictionary.confirmImport()

    expect(api.dictionary.import).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith(t('dict.nothingToImport'))
    expect(dictionary.importOpen).toBe(true)
  })

  it('does not import a file without data rows', async () => {
    const dictionary = withFile('word,translation')
    await dictionary.confirmImport()
    expect(api.dictionary.import).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith(t('dict.nothingToImport'))
  })

  it('keeps the dialog open and names the rejected rows when the server refuses', async () => {
    api.dictionary.import.mockRejectedValue(new ApiError('bad rows', 400, ['2', '5']))
    const dictionary = withFile()
    await dictionary.confirmImport()

    expect(message.error).toHaveBeenCalledWith(t('dict.importFailedRows', { rows: '2, 5' }))
    expect(dictionary.importOpen).toBe(true)
    expect(dictionary.file).not.toBeNull()
  })

  it('shows one plain message for any other failure', async () => {
    api.dictionary.import.mockRejectedValue(new ApiError('down'))
    const dictionary = withFile()
    await dictionary.confirmImport()
    expect(message.error).toHaveBeenCalledWith(t('dict.importFailed'))
  })
})
