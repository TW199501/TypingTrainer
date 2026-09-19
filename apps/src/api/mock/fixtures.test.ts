import { describe, expect, it } from 'vitest'
import { modelStorage, prompts } from './fixtures'

describe('catalogue fixtures', () => {
  it('localises model notes for Traditional Chinese', () => {
    expect(modelStorage('zh-TW').models.find((m) => m.code === 'jieba-zh-tw')?.note).toBe('繁體中文分詞')
  })

  it('localises model notes for Simplified Chinese', () => {
    expect(modelStorage('zh-CN').models.find((m) => m.code === 'bge-m3')?.note).toBe('多语语义搜索向量')
  })

  it('falls back to English for an unknown locale', () => {
    expect(modelStorage('fr').models[0].note).toBe(modelStorage('en').models[0].note)
  })

  it('localises built-in prompt names without translating the LLM body', () => {
    const zh = prompts('zh-TW').find((p) => p.code === 'categorise')
    const en = prompts('en').find((p) => p.code === 'categorise')
    expect(zh?.name).toBe('分類')
    expect(zh?.content).toBe(en?.content)
  })
})
