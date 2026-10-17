import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  dictionary: { list: vi.fn(), import: vi.fn(), preview: vi.fn(), importFile: vi.fn() },
}))
/** Whether the dictionary goes to the API (desktop) or stays in the browser (web mock). */
const real = vi.hoisted(() => ({ value: false }))
vi.mock('@/api', async (orig) => ({
  ...(await orig<typeof import('@/api')>()),
  api,
  usesRealApi: () => real.value,
}))
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

const file = (text = CSV, name = 'words.csv'): DictFile => ({
  name,
  rows: text.split('\n').length - 1,
  cols: ['word', 'translation', 'phonetic', 'tag'],
  sample: [],
  format: 'csv',
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

function withFile(text?: string, name?: string) {
  const dictionary = useDictionaryStore()
  dictionary.file = file(text, name)
  dictionary.map = { w: 'word', zh: 'translation', ph: 'phonetic', cat: 'tag' }
  dictionary.importOpen = true
  return dictionary
}

describe('dictionary import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    real.value = false
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
    const dictionary = withFile('word\ttranslation\nbalance\t餘額', 'words.tsv')
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

  it('reports an import that went through even when the reload after it fails', async () => {
    api.dictionary.import.mockResolvedValue({ added: 3, skipped: 0 })
    api.dictionary.list.mockRejectedValue(new Error('offline'))
    const dictionary = withFile()
    await dictionary.confirmImport()

    expect(message.success).toHaveBeenCalledWith(t('dict.imported', { added: 3, skipped: 0 }))
    expect(message.error).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith(t('dict.reloadFailed'))
    expect(dictionary.importOpen).toBe(false)
    expect(dictionary.file).toBeNull()
  })

  it('ignores a second click while the import is pending', async () => {
    let done!: (v: { added: number; skipped: number }) => void
    api.dictionary.import.mockReturnValue(new Promise((r) => (done = r)))
    const dictionary = withFile()

    const calls = [dictionary.confirmImport(), dictionary.confirmImport()]
    done({ added: 3, skipped: 0 })
    await Promise.all(calls)

    expect(api.dictionary.import).toHaveBeenCalledOnce()
    expect(message.success).toHaveBeenCalledOnce()
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
    expect(message.error.mock.calls[0][0]).toContain('Records without a word: 2, 5')
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

/** 「中文」 in Big5. */
const BIG5_ZHONGWEN = [0xa4, 0xa4, 0xa4, 0xe5]

describe('dictionary file, web mock', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    real.value = false
  })

  it('parses a Big5 .csv in the browser and previews it through the column map', async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('word,zh,ph,topic\nchinese,'),
      ...BIG5_ZHONGWEN,
      ...new TextEncoder().encode(',/x/,Lang\n'),
    ])
    const dictionary = useDictionaryStore()
    await dictionary.loadFile(new File([bytes], 'big5.csv'))

    expect(dictionary.file).toMatchObject({ rows: 1, cols: ['word', 'zh', 'ph', 'topic'], format: 'csv' })
    expect(dictionary.preview).toEqual([{ w: 'chinese', zh: '中文', cat: 'Lang' }])
    dictionary.map.cat = 'ph'
    expect(dictionary.preview[0].cat).toBe('/x/')
    expect(api.dictionary.preview).not.toHaveBeenCalled()
  })

  it('says Excel files need the desktop app and loads nothing', async () => {
    const dictionary = useDictionaryStore()
    await dictionary.loadFile(new File(['PK'], 'words.xlsx'))

    expect(message.warning).toHaveBeenCalledWith(t('dict.xlsxDesktopOnly'))
    expect(message.warning.mock.calls[0][0]).toBe('Excel files can be imported in the desktop app')
    expect(dictionary.file).toBeNull()
  })

  it.each([true, false])('refuses a .json file (API: %s)', async (useApi) => {
    real.value = useApi
    const dictionary = useDictionaryStore()
    await dictionary.loadFile(new File(['[]'], 'words.json'))

    expect(message.warning).toHaveBeenCalledWith(t('dict.unsupportedFile'))
    expect(api.dictionary.preview).not.toHaveBeenCalled()
    expect(dictionary.file).toBeNull()
  })
})

describe('dictionary file, desktop API', () => {
  const PREVIEW = {
    headers: ['word', 'translation', 'phonetic', 'tag'],
    sample: [
      ['balance', '餘額', '/ˈbæləns/', 'Banking'],
      ['chinese', '中文', '', ''],
    ],
    format: 'xlsx' as const,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    real.value = true
    api.dictionary.list.mockResolvedValue([entry(1)])
    api.dictionary.preview.mockResolvedValue(PREVIEW)
  })

  async function chosen(name = 'words.xlsx') {
    const dictionary = useDictionaryStore()
    const raw = new File(['PK'], name)
    await dictionary.loadFile(raw)
    dictionary.importOpen = true
    return { dictionary, raw }
  }

  it('fills the column map and preview from what the server read', async () => {
    const { dictionary, raw } = await chosen()

    expect(api.dictionary.preview).toHaveBeenCalledWith(raw)
    expect(dictionary.file).toMatchObject({ rows: null, cols: PREVIEW.headers, format: 'xlsx', raw })
    expect(dictionary.map).toEqual({ w: 'word', zh: 'translation', ph: 'phonetic', cat: 'tag' })
    expect(dictionary.preview).toEqual([
      { w: 'balance', zh: '餘額', cat: 'Banking' },
      { w: 'chinese', zh: '中文', cat: 'Uncategorised' },
    ])
  })

  it('uploads the original file with the map and the dedupe switch, then reloads', async () => {
    api.dictionary.importFile.mockResolvedValue({ added: 2, skipped: 0 })
    const { dictionary, raw } = await chosen()
    dictionary.dedupe = false
    await dictionary.confirmImport()

    expect(api.dictionary.import).not.toHaveBeenCalled()
    expect(api.dictionary.importFile).toHaveBeenCalledWith(
      raw,
      { word: 'word', zh: 'translation', phonetic: 'phonetic', topic: 'tag' },
      false,
      expect.any(Function),
    )
    expect(message.success).toHaveBeenCalledWith(t('dict.imported', { added: 2, skipped: 0 }))
    expect(api.dictionary.list).toHaveBeenCalledOnce()
    expect(dictionary.importOpen).toBe(false)
    expect(dictionary.file).toBeNull()
  })

  it('shows the upload progress, then that the server is working', async () => {
    let report!: (fraction: number) => void
    let done!: (v: { added: number; skipped: number }) => void
    api.dictionary.importFile.mockImplementation((_f, _m, _s, onProgress) => {
      report = onProgress
      return new Promise((r) => (done = r))
    })
    const { dictionary } = await chosen()

    const pending = dictionary.confirmImport()
    expect(dictionary.phase).toBe('uploading')
    report(0.42)
    expect(dictionary.progress).toBe(42)
    report(1)
    expect(dictionary.phase).toBe('processing')
    const second = dictionary.confirmImport()
    done({ added: 1, skipped: 0 })
    await Promise.all([pending, second])

    expect(api.dictionary.importFile).toHaveBeenCalledOnce()
    expect(dictionary.phase).toBe('idle')
    expect(dictionary.importing).toBe(false)
  })

  it('names the records without a word, and how many more there are', async () => {
    api.dictionary.importFile.mockRejectedValue(new ApiError('Some rows have no word.', 400, ['3', '5'], 12))
    const { dictionary } = await chosen()
    await dictionary.confirmImport()

    const shown = message.error.mock.calls[0][0] as string
    expect(shown).toBe(
      t('dict.importFailedRows', { rows: '3, 5' }) + t('dict.importFailedMore', { count: 10 }),
    )
    expect(shown).toBe('Could not import. Nothing was added. Records without a word: 3, 5 and 10 more')
    expect(dictionary.importOpen).toBe(true)
    expect(dictionary.file).not.toBeNull()
  })

  it('does not upload when no word column is mapped or the file has no data rows', async () => {
    const { dictionary } = await chosen()
    dictionary.map.w = ''
    await dictionary.confirmImport()
    dictionary.map.w = 'word'
    dictionary.file!.sample = []
    await dictionary.confirmImport()

    expect(api.dictionary.importFile).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledTimes(2)
    expect(message.warning).toHaveBeenCalledWith(t('dict.nothingToImport'))
  })

  it('reports a file the server cannot read and keeps no file', async () => {
    api.dictionary.preview.mockRejectedValue(new ApiError('The file could not be read', 400))
    const { dictionary } = await chosen()

    expect(message.error).toHaveBeenCalledWith(t('dict.previewFailed'))
    expect(dictionary.file).toBeNull()
    expect(dictionary.previewing).toBe(false)
  })

  it('keeps the file chosen last when an earlier preview answers late', async () => {
    let first!: (v: typeof PREVIEW) => void
    api.dictionary.preview
      .mockReturnValueOnce(new Promise((r) => (first = r)))
      .mockResolvedValueOnce({ ...PREVIEW, headers: ['second'] })
    const dictionary = useDictionaryStore()
    const a = dictionary.loadFile(new File(['PK'], 'a.xlsx'))
    await dictionary.loadFile(new File(['x'], 'b.csv'))
    first(PREVIEW)
    await a

    expect(dictionary.file?.name).toBe('b.csv')
    expect(dictionary.file?.cols).toEqual(['second'])
  })
})
