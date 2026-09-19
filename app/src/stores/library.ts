import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_CATS } from '@/data/constants'
import { analyzeText } from '@/lib/analyze'
import type { AnalysisResult, Category, ImportFile, TextItem } from '@/data/types'

export interface CatModal {
  level: 'sub' | 'top'
  parent: string
  name: string
}

const PALETTE = ['#d97757', '#a8763e', '#7d8c5c', '#b06a4f', '#c08552', '#6f8f85']

export const useLibraryStore = defineStore('library', () => {
  const categories = ref<Category[]>(DEFAULT_CATS.map((c) => ({ ...c, children: c.children.slice() })))
  const expanded = ref<Record<string, boolean>>({ chinese: true })

  const texts = ref<TextItem[]>([
    { title: 'Q3 revenue outlook', category: 'Chinese', sub: 'Finance', level: 'L4', chars: 412, best: 52, last: 'Today' },
    { title: 'SQL query drills #12', category: 'Code', sub: 'SQL', level: 'L6', chars: 286, best: 63, last: 'Yesterday' },
    { title: 'Refund reply template', category: 'English', sub: 'Support email', level: 'L3', chars: 534, best: 74, last: 'Sep 16' },
    { title: 'Memo: annual stocktake', category: 'Chinese', sub: 'Official', level: 'L4', chars: 365, best: 48, last: 'Sep 16' },
    { title: 'Bopomofo: ㄓㄔㄕㄖ drill', category: 'Bopomofo', sub: 'Initials', level: 'L2', chars: 96, best: 44, last: 'Sep 15' },
    { title: 'C# exception handling', category: 'Code', sub: 'C#', level: 'L6', chars: 238, best: 58, last: 'Sep 15' },
    { title: 'FX and fee vocabulary ×30', category: 'Vocabulary', sub: 'Banking', level: 'L3', chars: 268, best: 61, last: 'Sep 14' },
    { title: 'Key drill: semicolon and slash', category: 'Basics', sub: 'Symbols', level: 'L5', chars: 96, best: 69, last: 'Sep 13' },
    { title: 'AI chip supply chain report', category: 'English', sub: 'Tech news', level: 'L4', chars: 478, best: 72, last: 'Sep 09' },
  ])

  // Composer (paste → analyse → save)
  const composerOpen = ref(false)
  const draft = ref('')
  const ai = ref<AnalysisResult | null>(null)

  // File import dialog
  const importOpen = ref(false)
  const importFiles = ref<ImportFile[]>([])
  const importMode = ref<'ai' | 'manual'>('ai')

  // Category dialog
  const catModal = ref<CatModal | null>(null)

  const catCount = computed(
    () => categories.value.length + ' groups · ' +
      categories.value.reduce((a, c) => a + c.children.length, 0) + ' topics',
  )

  const byId = (id: string) => categories.value.find((c) => c.id === id)

  function toggleExpanded(id: string) {
    expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
  }

  function renameGroup(id: string, name: string) {
    categories.value = categories.value.map((c) => (c.id === id ? { ...c, name } : c))
  }

  function removeGroup(id: string) {
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  function renameTopic(groupId: string, topicId: string, name: string) {
    categories.value = categories.value.map((g) =>
      g.id !== groupId ? g : { ...g, children: g.children.map((y) => (y.id === topicId ? { ...y, name } : y)) })
  }

  function removeTopic(groupId: string, topicId: string) {
    categories.value = categories.value.map((g) =>
      g.id !== groupId ? g : { ...g, children: g.children.filter((y) => y.id !== topicId) })
  }

  function openCatModal() {
    catModal.value = { level: 'sub', parent: categories.value[0]?.id || '', name: '' }
  }
  function closeCatModal() { catModal.value = null }

  function submitCat() {
    const m = catModal.value
    if (!m) return
    const name = (m.name || '').trim()
    if (!name) return

    if (m.level === 'top') {
      const id = 'c' + Date.now()
      categories.value = [...categories.value, {
        id, name, color: PALETTE[categories.value.length % PALETTE.length],
        layout: 'en', kind: 'custom', children: [],
      }]
      expanded.value = { ...expanded.value, [id]: true }
    } else {
      categories.value = categories.value.map((g) =>
        g.id !== m.parent ? g : { ...g, children: [...g.children, { id: 's' + Date.now(), name, count: 0 }] })
      expanded.value = { ...expanded.value, [m.parent]: true }
    }
    catModal.value = null
  }

  function analyzeDraft() { ai.value = analyzeText(draft.value) }

  function saveDraft() {
    const a = ai.value || analyzeText(draft.value)
    if (!a) return
    categories.value = categories.value.map((c) =>
      c.name !== a.category ? c : {
        ...c,
        children: c.children.some((x) => x.name === a.sub)
          ? c.children.map((x) => (x.name === a.sub ? { ...x, count: x.count + 1 } : x))
          : [...c.children, { id: a.sub, name: a.sub, count: 1 }],
      })
    texts.value = [
      { title: a.title, category: a.category, sub: a.sub, level: a.level, chars: a.chars, best: '—', last: 'Just now' },
      ...texts.value,
    ]
    draft.value = ''
    ai.value = null
    composerOpen.value = false
  }

  /** Reads dropped/selected files and pre-labels each one with the AI guess. */
  function addFiles(list: File[]) {
    if (!list.length) return
    list.slice(0, 20).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result || '')
        const ext = (file.name.split('.').pop() || '').toUpperCase()
        const size = file.size < 1024 ? file.size + ' B' : (file.size / 1024).toFixed(1) + ' KB'
        const a = analyzeText(text)
        importFiles.value = [...importFiles.value, {
          name: file.name, ext, size, text,
          note: a ? a.category + ' › ' + a.sub + '　' + a.level : 'Empty file',
        }]
      }
      reader.readAsText(file)
    })
  }

  function removeImportFile(i: number) {
    importFiles.value = importFiles.value.filter((_, j) => j !== i)
  }

  function confirmImport() {
    if (!importFiles.value.length) return
    const added: TextItem[] = importFiles.value.map((fl) => {
      const a = importMode.value === 'ai' ? analyzeText(fl.text) : null
      return {
        title: a?.title || fl.name.replace(/\.[^.]+$/, ''),
        category: a?.category || 'English',
        sub: a?.sub || 'Literature',
        level: a?.level || 'L3',
        chars: fl.text.length,
        best: '—',
        last: 'Just now',
      }
    })
    texts.value = [...added, ...texts.value]
    importFiles.value = []
    importOpen.value = false
  }

  return {
    categories, expanded, texts, catCount, byId,
    composerOpen, draft, ai, analyzeDraft, saveDraft,
    importOpen, importFiles, importMode, addFiles, removeImportFile, confirmImport,
    catModal, openCatModal, closeCatModal, submitCat,
    toggleExpanded, renameGroup, removeGroup, renameTopic, removeTopic,
  }
})
