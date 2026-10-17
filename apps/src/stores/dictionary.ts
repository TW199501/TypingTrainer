import { ref } from 'vue'
import { defineStore } from 'pinia'
import { message } from 'ant-design-vue'
import { api, ApiError, type DictEntryDto, type ImportWordDto } from '@/api'
import { i18n } from '@/i18n'
import type { DictEntry } from '@/data/types'

export interface DictFile {
  name: string
  rows: number
  cols: string[]
  preview: { w: string; zh: string; cat: string }[]
  /** The whole file, parsed again on import. */
  text: string
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
  /** True while an import is in flight; a second click meanwhile does nothing. */
  const importing = ref(false)

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

  function loadFile(f: File | undefined) {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const lines = text.split(/\r?\n/).filter(Boolean)
      const sep = text.includes('\t') ? '\t' : ','
      const cols = (lines[0] || 'word,translation,phonetic,tag').split(sep).map((c) => c.trim())
      const rows = lines.slice(1)
      const preview = rows.slice(0, 3).map((r) => {
        const p = r.split(sep)
        return { w: p[0] || '', zh: p[1] || '', cat: p[3] || 'Uncategorised' }
      })
      file.value = { name: f.name, rows: rows.length, cols, preview, text }
      map.value = { w: cols[0] || '', zh: cols[1] || '', ph: cols[2] || '', cat: cols[3] || '' }
    }
    reader.readAsText(f)
  }

  function closeImport() {
    importOpen.value = false
  }

  /** Turns every data row into a word, reading each field from the column the user mapped to it. */
  function mappedWords(f: DictFile): ImportWordDto[] {
    const lines = f.text.split(/\r?\n/).filter(Boolean)
    const sep = f.text.includes('\t') ? '\t' : ','
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

  async function confirmImport() {
    const t = i18n.global.t
    const words = file.value ? mappedWords(file.value) : []
    if (!words.length) {
      message.warning(t('dict.nothingToImport'))
      return
    }
    if (importing.value) return
    importing.value = true
    try {
      let result: { added: number; skipped: number }
      try {
        result = await api.dictionary.import({ skipDuplicates: dedupe.value, words })
      } catch (e) {
        message.error(
          e instanceof ApiError && e.failed?.length
            ? t('dict.importFailedRows', { rows: e.failed.join(', ') })
            : t('dict.importFailed'),
        )
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
    importing,
    load,
    reload,
    listFor,
    loadFile,
    closeImport,
    confirmImport,
  }
})
