import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { BASE_URL, MODELS, type Provider } from '@/data/constants'
import type { LocalModel, PromptPreset } from '@/data/types'

export interface AiConfig {
  provider: Provider
  model: string
  key: string
  // Numeric fields stay `number | string` because the inputs bind raw text.
  temp: number | string
  maxChars: number | string
  autoTitle: boolean
  autoCat: boolean
  autoLevel: boolean
  genSentence: boolean
  genVocab: boolean
  rewrite: boolean
  url: string
  timeout: number | string
  retry: number | string
  concurrency: number | string
  lang: string
  offlineFallback: boolean
  sendStats: boolean
  status: 'connected' | 'untested'
}

export const useAiStore = defineStore('ai', () => {
  const cfg = ref<AiConfig>({
    provider: 'Claude',
    model: 'claude-sonnet-4-5',
    key: 'sk-ant-••••••••••••7f2a',
    temp: 30,
    maxChars: 1200,
    autoTitle: true,
    autoCat: true,
    autoLevel: true,
    genSentence: true,
    genVocab: false,
    rewrite: false,
    url: 'https://api.anthropic.com/v1',
    timeout: 30,
    retry: 2,
    concurrency: 3,
    lang: 'zh-TW',
    offlineFallback: true,
    sendStats: false,
    status: 'connected',
  })

  const tab = ref<'conn' | 'param' | 'auto'>('conn')

  // Model picker
  const modelQuery = ref<string | null>(null)
  const modelOpen = ref(false)

  const prompts = ref<PromptPreset[]>([
    {
      name: 'Categorise',
      text: 'Detect the language and topic, then return a title (max 18 chars), group, topic and an L1–L6 level with a one-line rationale.',
    },
    {
      name: 'Examples',
      text: 'Write one practical 12–18 word sentence for the given term in a workplace context, with a Traditional Chinese translation.',
    },
    {
      name: 'Rewrite',
      text: 'Weave the user’s most-missed keys naturally into the text, keeping it readable and about the same length.',
    },
    {
      name: 'Level',
      text: 'Score L1–L6 from sentence length, symbol density and rare-word ratio, with a one-line reason.',
    },
  ])
  const promptIdx = ref(0)

  // Both are filled by loadModels(). The directory is never hard-coded here:
  // it belongs to whichever runtime owns the disk — the Tauri shell on desktop,
  // the server in a browser — so a literal would be wrong on two of the three.
  const modelDir = ref('')
  const modelDirWritable = ref(true)
  const localModels = ref<LocalModel[]>([])
  const modelsLoaded = ref(false)

  async function loadModels() {
    const storage = await api.models.storage()
    modelDir.value = storage.directory
    modelDirWritable.value = storage.writable
    localModels.value = storage.models.map((m) => ({
      code: m.code,
      name: m.name,
      kind: m.kind,
      note: m.note,
      mb: m.mb,
      installed: m.installed,
    }))
    modelsLoaded.value = true
  }

  /** Switching provider carries its default model and endpoint across. */
  function pickProvider(p: Provider) {
    cfg.value = { ...cfg.value, provider: p, model: MODELS[p][0][0], url: BASE_URL[p] }
    modelQuery.value = null
    modelOpen.value = false
  }

  function pickModel(id: string) {
    cfg.value = { ...cfg.value, model: id }
    modelOpen.value = false
    modelQuery.value = null
  }

  function addPrompt() {
    prompts.value = [...prompts.value, { name: 'Prompt ' + (prompts.value.length + 1), text: '' }]
    promptIdx.value = prompts.value.length - 1
  }

  /** Optimistic: flip the row, then roll it back if the server disagrees. */
  async function toggleLocalModel(i: number) {
    const target = localModels.value[i]
    if (!target) return

    const next = !target.installed
    const apply = (value: boolean) => {
      localModels.value = localModels.value.map((x, j) => (j === i ? { ...x, installed: value } : x))
    }

    apply(next)
    try {
      if (next) await api.models.install(target.code)
      else await api.models.remove(target.code)
    } catch {
      apply(!next)
    }
  }

  return {
    cfg,
    tab,
    modelQuery,
    modelOpen,
    prompts,
    promptIdx,
    modelDir,
    modelDirWritable,
    localModels,
    modelsLoaded,
    loadModels,
    pickProvider,
    pickModel,
    addPrompt,
    toggleLocalModel,
  }
})
