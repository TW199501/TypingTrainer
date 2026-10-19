import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { message } from 'ant-design-vue'
import { api, ApiError, type CategoryDto, type CreateTextBody, type TextDto } from '@/api'
import { i18n } from '@/i18n'
import { analyzeText } from '@/lib/analyze'
import { readTextFile } from '@/lib/decode'
import type { AnalysisResult, Category, ImportFile, TextItem } from '@/data/types'

export interface CatModal {
  level: 'sub' | 'top'
  parent: string
  name: string
}

const PALETTE = ['#d97757', '#a8763e', '#7d8c5c', '#b06a4f', '#c08552', '#6f8f85']

const toCategory = (c: CategoryDto): Category => ({ ...c, children: c.children.map((x) => ({ ...x })) })

const toText = (t: TextDto): TextItem => ({
  id: t.id,
  isBuiltIn: t.isBuiltIn,
  categoryId: t.categoryId,
  subId: t.subId,
  title: t.title,
  category: t.category,
  sub: t.sub,
  level: t.level,
  chars: t.chars,
  best: t.best ?? '—',
  last: t.lastPractisedAt ?? '—',
})

export const useLibraryStore = defineStore('library', () => {
  const categories = ref<Category[]>([])
  const expanded = ref<Record<string, boolean>>({ chinese: true })
  const texts = ref<TextItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  /** Called once from the app shell; everything else reads the loaded state. */
  async function load() {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      const [cats, list] = await Promise.all([api.categories.list(), api.texts.list()])
      categories.value = cats.map(toCategory)
      texts.value = list.map(toText)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Reads everything again even when it was loaded before, e.g. after the API restarted. */
  async function reload() {
    await refresh()
    loaded.value = true
  }

  /** Re-reads the tree and the texts after a write, so the screen shows what the store really holds. */
  async function refresh() {
    const [cats, list] = await Promise.all([api.categories.list(), api.texts.list()])
    categories.value = cats.map(toCategory)
    texts.value = list.map(toText)
  }

  /** True while a write is in flight; a second save started meanwhile does nothing. */
  const saving = ref(false)

  interface SaveOptions {
    /** The message for a failed write; null falls back to the generic one. */
    onError?: (e: unknown) => string | null
    /** Runs as soon as the write resolved, before the lists are read again. */
    onSaved?: () => void
  }

  /**
   * Runs a write. A failed write becomes one toast and the screen keeps its old state.
   * Once the write resolved it counts as saved, whatever happens to the reload that
   * follows; a failed reload gets a toast of its own.
   */
  async function save(write: () => Promise<void>, opts: SaveOptions = {}): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      try {
        await write()
      } catch (e) {
        message.error(opts.onError?.(e) ?? i18n.global.t('library.saveFailed'))
        return false
      }
      opts.onSaved?.()
      try {
        await refresh()
      } catch {
        message.warning(i18n.global.t('library.reloadFailed'))
      }
      return true
    } finally {
      saving.value = false
    }
  }

  const deleteError = (e: unknown) =>
    e instanceof ApiError && e.status === 409 ? i18n.global.t('library.cannotDeleteBuiltIn') : null

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

  const catCount = computed(() => ({
    groups: categories.value.length,
    topics: categories.value.reduce((a, c) => a + c.children.length, 0),
  }))

  const byId = (id: string) => categories.value.find((c) => c.id === id)

  function toggleExpanded(id: string) {
    expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
  }

  /** Commits a rename once the input is done (change, not input); a blank name keeps the old one. */
  async function commitRename(groupId: string, topicId: string | null, name: string) {
    const group = byId(groupId)
    const current = topicId === null ? group : group?.children.find((x) => x.id === topicId)
    const next = name.trim()
    if (!current || !next || next === current.name) return
    await save(() => api.categories.rename(topicId ?? groupId, next))
  }

  async function removeGroup(id: string) {
    await save(() => api.categories.remove(id), { onError: deleteError })
  }

  async function removeTopic(_groupId: string, topicId: string) {
    await save(() => api.categories.remove(topicId), { onError: deleteError })
  }

  async function removeText(id: number) {
    await save(() => api.texts.remove(id), { onError: deleteError })
  }

  function openCatModal() {
    catModal.value = { level: 'sub', parent: categories.value[0]?.id || '', name: '' }
  }
  function closeCatModal() {
    catModal.value = null
  }

  async function submitCat() {
    const m = catModal.value
    if (!m) return
    const name = (m.name || '').trim()
    if (!name) return

    let openId = m.parent
    await save(
      async () => {
        const body =
          m.level === 'top'
            ? { level: 'top' as const, name, color: PALETTE[categories.value.length % PALETTE.length] }
            : { level: 'sub' as const, parentId: m.parent, name }
        const { id } = await api.categories.create(body)
        if (m.level === 'top') openId = id
      },
      {
        onSaved: () => {
          expanded.value = { ...expanded.value, [openId]: true }
          catModal.value = null
        },
      },
    )
  }

  function analyzeDraft() {
    ai.value = analyzeText(draft.value)
  }

  /** The category the analyser named, matched on the display name or the kind code. */
  const categoryFor = (name: string) =>
    categories.value.find((c) => c.name === name || c.kind === name.toLowerCase())

  async function saveDraft() {
    const a = ai.value || analyzeText(draft.value)
    if (!a) return
    await save(
      async () => {
        await api.texts.create({
          title: a.title,
          content: draft.value,
          categoryId: categoryFor(a.category)?.id,
          sub: a.sub,
          level: a.level,
        })
      },
      {
        onSaved: () => {
          draft.value = ''
          ai.value = null
          composerOpen.value = false
        },
      },
    )
  }

  /** Reads dropped/selected files (UTF-8, or Big5) and pre-labels each one with the AI guess. */
  function addFiles(list: File[]) {
    if (!list.length) return
    list.slice(0, 20).forEach((file) => {
      // A file that cannot be read is left out, as before.
      readTextFile(file).then(
        (text) => {
          const ext = (file.name.split('.').pop() || '').toUpperCase()
          const size = file.size < 1024 ? file.size + ' B' : (file.size / 1024).toFixed(1) + ' KB'
          const a = analyzeText(text)
          importFiles.value = [
            ...importFiles.value,
            {
              name: file.name,
              ext,
              size,
              text,
              note: a ? a.category + ' › ' + a.sub + '　' + a.level : '',
            },
          ]
        },
        () => {},
      )
    })
  }

  function removeImportFile(i: number) {
    importFiles.value = importFiles.value.filter((_, j) => j !== i)
  }

  async function confirmImport() {
    if (!importFiles.value.length) return
    const body: CreateTextBody[] = importFiles.value.map((fl) => {
      const a = importMode.value === 'ai' ? analyzeText(fl.text) : null
      const base = { title: a?.title || fl.name.replace(/\.[^.]+$/, ''), content: fl.text, fileName: fl.name }
      return a ? { ...base, categoryId: categoryFor(a.category)?.id, sub: a.sub, level: a.level } : base
    })
    await save(
      async () => {
        await api.texts.import(body)
      },
      {
        onError: (e) =>
          e instanceof ApiError && e.failed?.length
            ? i18n.global.t('library.importFailed', { files: e.failed.join(', ') })
            : null,
        onSaved: () => {
          importFiles.value = []
          importOpen.value = false
        },
      },
    )
  }

  return {
    categories,
    expanded,
    texts,
    catCount,
    byId,
    load,
    reload,
    loading,
    loaded,
    saving,
    composerOpen,
    draft,
    ai,
    analyzeDraft,
    saveDraft,
    importOpen,
    importFiles,
    importMode,
    addFiles,
    removeImportFile,
    confirmImport,
    catModal,
    openCatModal,
    closeCatModal,
    submitCat,
    toggleExpanded,
    commitRename,
    removeGroup,
    removeTopic,
    removeText,
  }
})
