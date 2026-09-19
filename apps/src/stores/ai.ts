import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { BASE_URL, MODELS, type Provider } from '@/data/constants'
import type { LocalModel, PromptPreset } from '@/data/types'
import { i18n } from '@/i18n'
import { useSettingsStore } from './settings'

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
  const settings = useSettingsStore()

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

  const prompts = ref<PromptPreset[]>([])
  const promptIdx = ref(0)
  const promptsLoaded = ref(false)

  // Both are filled by loadModels(). The directory is never hard-coded here:
  // it belongs to whichever runtime owns the disk — the Tauri shell on desktop,
  // the server in a browser — so a literal would be wrong on two of the three.
  const modelDir = ref('')
  const modelDirWritable = ref(true)
  const localModels = ref<LocalModel[]>([])
  const modelsLoaded = ref(false)

  async function loadModels() {
    const storage = await api.models.storage(settings.uiLang)
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

  async function loadPrompts() {
    const list = await api.prompts.list(settings.uiLang)
    const previous = promptsLoaded.value
      ? new Map(prompts.value.filter((p) => p.code).map((p) => [p.code!, p]))
      : new Map<string, PromptPreset>()
    const custom = prompts.value.filter((p) => !p.code)
    prompts.value = [
      ...list.map((p) => ({
        code: p.code,
        name: p.name,
        text: previous.get(p.code)?.text ?? p.content,
      })),
      ...custom,
    ]
    if (promptIdx.value >= prompts.value.length) promptIdx.value = 0
    promptsLoaded.value = true
  }

  function addPrompt() {
    prompts.value = [
      ...prompts.value,
      { name: String(i18n.global.t('ai.promptName', { index: prompts.value.length + 1 })), text: '' },
    ]
    promptIdx.value = prompts.value.length - 1
  }

  watch(
    () => settings.uiLang,
    () => {
      if (modelsLoaded.value) void loadModels()
      if (promptsLoaded.value) void loadPrompts()
    },
  )

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
    promptsLoaded,
    loadPrompts,
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
