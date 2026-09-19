import { describe, expect, it } from 'vitest'
import { analyzeText } from './analyze'

describe('analyzeText', () => {
  it('returns null for empty input', () => {
    expect(analyzeText('   ')).toBeNull()
  })

  it('detects SQL as code', () => {
    const a = analyzeText('SELECT UserId, AVG(WPM) FROM Sessions WHERE CreatedAt > @start;')!
    expect(a.category).toBe('Code')
    expect(a.sub).toBe('SQL')
  })

  it('files Chinese finance text under Chinese › Finance', () => {
    const a = analyzeText('本季營收成長，匯率波動使毛利率下降。')!
    expect(a.category).toBe('Chinese')
    expect(a.sub).toBe('Finance')
  })

  it('files English banking text under English › Banking', () => {
    const a = analyzeText('Please transfer the balance from your account before the payment date.')!
    expect(a.category).toBe('English')
    expect(a.sub).toBe('Banking')
  })

  it('truncates long titles to 18 characters plus an ellipsis', () => {
    const a = analyzeText('a'.repeat(50))!
    expect(a.title).toHaveLength(19)
    expect(a.title.endsWith('…')).toBe(true)
  })

  it('scores a level between L1 and L6', () => {
    const a = analyzeText('Hello there, this is a plain sentence.')!
    expect(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']).toContain(a.level)
  })
})
