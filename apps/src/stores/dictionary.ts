import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { message } from 'ant-design-vue'
import { api, ApiError, usesRealApi, type DictEntryDto, type ImportWordDto, type WordImportMap } from '@/api'
import { i18n } from '@/i18n'
import { readTextFile } from '@/lib/decode'
import type { DictEntry } from '@/data/types'

/** The file types a dictionary import accepts. */
export const DICT_EXTENSIONS = ['.xlsx', '.csv', '.tsv', '.txt'] as const

export interface DictFile {
  name: string
  /** Data rows in the file; null when the server reads it and only the first rows are known. */
  rows: number | null
  cols: string[]
  /** The first data rows, cells in `cols` order. */
  sample: string[][]
  format: string
  /** Web mock: the decoded file, parsed again on import. */
  text?: string
  /** Real API: the chosen file, uploaded as it is. */
  raw?: File
}

const toEntry = (d: DictEntryDto): DictEntry => ({
  id: d.id,
  w: d.word,
  ph: d.phonetic,
  pos: d.pos,
  zh: d.zh,
  cat: d.topic,
  ex: d.example,
  mastery: d.mastery,
})

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/** The web mock's own reading of a text file: commas for .csv, tabs for .tsv, and for .txt whichever the first line uses. */
function separatorFor(extension: string, text: string): string {
  if (extension === '.tsv') return '\t'
  if (extension === '.csv') return ','
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  return first.includes('\t') ? '\t' : ','
}

export const useDictionaryStore = defineStore('dictionary', () => {
  const entries = ref<DictEntry[]>([])
  const loaded = ref(false)
  const query = ref('')
  const topic = ref('All')
  /** Word the practice drill rotates to, set by "Drill" in the word list. */
  const start = ref('')

  // Import dialog
  const importOpen = ref(false)
  const source = ref('ecdict')
  const file = ref<DictFile | null>(null)
  const map = ref<Record<string, string>>({})
  const dedupe = ref(true)
  /** True while the server reads a chosen file for its preview. */
  const previewing = ref(false)
  /** True while an import is in flight; a second click meanwhile does nothing. */
  const importing = ref(false)
  /** Where an upload to the API is: sending the file, then waiting while the server stores it. */
  const phase = ref<'idle' | 'uploading' | 'processing'>('idle')
  /** Percent of the file sent so far. */
  const progress = ref(0)

  /** Bumped by every chosen file, so a preview that answers late is dropped. */
  let fileRequest = 0

  async function load() {
    if (loaded.value) return
    await reload()
  }

  /** Reads the list again even when it was loaded before, e.g. after an import or a restarted API. */
  async function reload() {
    entries.value = (await api.dictionary.list()).map(toEntry)
    loaded.value = true
  }

  /** Entries of one topic, rotated so `start` comes first. */
  function listFor(subName: string | undefined, startWord: string): DictEntry[] {
    let l = entries.value.filter((d) => d.cat === subName)
    if (!l.length) l = entries.value
    const at = l.findIndex((d) => d.w === startWord)
    return at > 0 ? l.slice(at).concat(l.slice(0, at)) : l
  }

  /** The preview rows as the current column map reads them. */
  const preview = computed(() => {
    const f = file.value
    if (!f) return []
    const at = (key: string) => (map.value[key] ? f.cols.indexOf(map.value[key]) : -1)
    const [w, zh, cat] = ['w', 'zh', 'cat'].map(at)
    const cell = (cells: string[], i: number) => (i < 0 ? '' : (cells[i] ?? '').trim())
    return f.sample.map((cells) => ({
      w: cell(cells, w),
      zh: cell(cells, zh),
      cat: cell(cells, cat) || 'Uncategorised',
    }))
  })

  function useFile(f: DictFile) {
    file.value = f
    map.value = { w: f.cols[0] || '', zh: f.cols[1] || '', ph: f.cols[2] || '', cat: f.cols[3] || '' }
  }

  /**
   * Reads a chosen file. With the API the server reads it, so .xlsx and Big5 text files
   * preview the same way they import; the web mock parses .csv, .tsv and .txt itself.
   */
  async function loadFile(f: File | undefined) {
    if (!f) return
    const t = i18n.global.t
    const extension = extensionOf(f.name)
    if (!(DICT_EXTENSIONS as readonly string[]).includes(extension)) {
      message.warning(t('dict.unsupportedFile'))
      return
    }
    const request = ++fileRequest

    if (usesRealApi('dictionary')) {
      previewing.value = true
      try {
        const p = await api.dictionary.preview(f)
        if (request !== fileRequest) return
        useFile({ name: f.name, rows: null, cols: p.headers, sample: p.sample, format: p.format, raw: f })
      } catch (e) {
        if (request !== fileRequest) return
        message.error(
          e instanceof ApiError && e.status === 413 ? t('dict.tooLarge') : t('dict.previewFailed'),
        )
      } finally {
        if (request === fileRequest) previewing.value = false
      }
      return
    }

    if (extension === '.xlsx') {
      message.warning(t('dict.xlsxDesktopOnly'))
      return
    }
    const text = await readTextFile(f)
    if (request !== fileRequest) return
    const sep = separatorFor(extension, text)
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const cols = (lines[0] || 'word,translation,phonetic,tag').split(sep).map((c) => c.trim())
    const rows = lines.slice(1)
    useFile({
      name: f.name,
      rows: rows.length,
      cols,
      sample: rows.slice(0, 3).map((r) => r.split(sep)),
      format: extension.slice(1),
      text,
    })
  }

  function closeImport() {
    importOpen.value = false
  }

  /** Web mock: turns every data row into a word, reading each field from the column the user mapped to it. */
  function mappedWords(f: DictFile): ImportWordDto[] {
    const text = f.text ?? ''
    const sep = separatorFor(extensionOf(f.name), text)
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const header = (lines[0] || '').split(sep).map((c) => c.trim())
    const at = (key: string) => (map.value[key] ? header.indexOf(map.value[key]) : -1)
    const [w, zh, ph, cat] = ['w', 'zh', 'ph', 'cat'].map(at)
    const cell = (cells: string[], i: number) => (i < 0 ? '' : (cells[i] ?? '').trim())
    if (w < 0) return []
    return lines
      .slice(1)
      .map((line) => line.split(sep))
      .map((cells) => ({
        word: cell(cells, w),
        zh: cell(cells, zh),
        phonetic: cell(cells, ph),
        pos: '',
        topic: cell(cells, cat),
        example: '',
      }))
  }

  /** The column map the API takes: header names, unmapped fields left out. */
  function columnMap(): WordImportMap {
    const pick = (key: string) => map.value[key] || undefined
    return { word: map.value.w ?? '', zh: pick('zh'), phonetic: pick('ph'), topic: pick('cat') }
  }

  /** Names the record numbers the server rejected, "record N" / "第 N 筆" rather than line numbers. */
  function failureMessage(e: unknown): string {
    const t = i18n.global.t
    if (e instanceof ApiError && e.failed?.length) {
      const more = (e.failedCount ?? e.failed.length) - e.failed.length
      return (
        t('dict.importFailedRows', { rows: e.failed.join(t('dict.listSep')) }) +
        (more > 0 ? t('dict.importFailedMore', { count: more }) : '')
      )
    }
    if (e instanceof ApiError && e.status === 413) return t('dict.tooLarge')
    return t('dict.importFailed')
  }

  /** Starts sending the file (API) or the parsed rows (web mock); null when there is nothing to send. */
  function send(f: DictFile): Promise<{ added: number; skipped: number }> | null {
    if (f.raw) {
      if (!map.value.w || !f.sample.length) return null
      phase.value = 'uploading'
      progress.value = 0
      return api.dictionary.importFile(f.raw, columnMap(), dedupe.value, (fraction) => {
        progress.value = Math.min(100, Math.round(fraction * 100))
        if (fraction >= 1) phase.value = 'processing'
      })
    }
    const words = mappedWords(f)
    return words.length ? api.dictionary.import({ skipDuplicates: dedupe.value, words }) : null
  }

  async function confirmImport() {
    const t = i18n.global.t
    if (importing.value) return
    const pending = file.value ? send(file.value) : null
    if (!pending) {
      message.warning(t('dict.nothingToImport'))
      return
    }
    importing.value = true
    try {
      let result: { added: number; skipped: number }
      try {
        result = await pending
      } catch (e) {
        message.error(failureMessage(e))
        return
      }
      // The words are stored now; a failed reload must not report the import as failed.
      message.success(t('dict.imported', result))
      importOpen.value = false
      file.value = null
      try {
        await reload()
      } catch {
        message.warning(t('dict.reloadFailed'))
      }
    } finally {
      importing.value = false
      phase.value = 'idle'
    }
  }

  return {
    entries,
    loaded,
    query,
    topic,
    start,
    importOpen,
    source,
    file,
    map,
    dedupe,
    previewing,
    importing,
    phase,
    progress,
    preview,
    load,
    reload,
    listFor,
    loadFile,
    closeImport,
    confirmImport,
  }
})
