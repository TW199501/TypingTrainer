import { describe, expect, it } from 'vitest'
import { usesRealApi } from './index'

describe('usesRealApi', () => {
  it('desktop uses the real API only for categories, texts and dictionary', () => {
    expect(usesRealApi('texts', true, true)).toBe(true)
    expect(usesRealApi('categories', true, true)).toBe(true)
    expect(usesRealApi('dictionary', true, true)).toBe(true)
    expect(usesRealApi('stats', true, true)).toBe(false)
  })

  it('the web build follows VITE_USE_MOCK', () => {
    expect(usesRealApi('texts', false, true)).toBe(false)
    expect(usesRealApi('stats', false, false)).toBe(true)
  })
})
