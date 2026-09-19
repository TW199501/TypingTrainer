import { ref } from 'vue'
import { defineStore } from 'pinia'
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
    { name: 'Categorise', text: 'Detect the language and topic, then return a title (max 18 chars), group, topic and an L1–L6 level with a one-line rationale.' },
    { name: 'Examples', text: 'Write one practical 12–18 word sentence for the given term in a workplace context, with a Traditional Chinese translation.' },
    { name: 'Rewrite', text: 'Weave the user’s most-missed keys naturally into the text, keeping it readable and about the same length.' },
    { name: 'Level', text: 'Score L1–L6 from sentence length, symbol density and rare-word ratio, with a one-line reason.' },
  ])
  const promptIdx = ref(0)

  const modelDir = ref('~/Library/TypeLab/models')
  const localModels = ref<LocalModel[]>([
    { name: 'jieba-zh-tw', kind: 'Token', note: 'Traditional Chinese segmentation', mb: 42, installed: true },
    { name: 'bge-m3', kind: 'Embed', note: 'Multilingual vectors for semantic search', mb: 2200, installed: true },
    { name: 'text2vec-base-chinese', kind: 'Embed', note: 'Lightweight Chinese vectors', mb: 410, installed: false },
    { name: 'bge-reranker-v2-m3', kind: 'Rerank', note: 'High-precision result reranking', mb: 1100, installed: false },
    { name: 'jina-reranker-v2-tiny', kind: 'Rerank', note: 'Lightweight rerank, realtime on desktop', mb: 280, installed: false },
  ])

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

  function toggleLocalModel(i: number) {
    localModels.value = localModels.value.map((x, j) => (j === i ? { ...x, installed: !x.installed } : x))
  }

  return {
    cfg, tab, modelQuery, modelOpen, prompts, promptIdx, modelDir, localModels,
    pickProvider, pickModel, addPrompt, toggleLocalModel,
  }
})
