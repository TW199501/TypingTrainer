import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DICT } from '@/data/constants'
import type { DictEntry } from '@/data/types'

export interface DictFile {
  name: string
  rows: number
  cols: string[]
  preview: { w: string; zh: string; cat: string }[]
}

export const useDictionaryStore = defineStore('dictionary', () => {
  const entries = ref<DictEntry[]>(DICT.slice())
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
      file.value = { name: f.name, rows: rows.length, cols, preview }
      map.value = { w: cols[0] || '', zh: cols[1] || '', ph: cols[2] || '', cat: cols[3] || '' }
    }
    reader.readAsText(f)
  }

  function closeImport() {
    importOpen.value = false
  }

  function confirmImport() {
    importOpen.value = false
    file.value = null
  }

  return {
    entries, query, topic, start,
    importOpen, source, file, map, dedupe,
    listFor, loadFile, closeImport, confirmImport,
  }
})
