import { describe, expect, it } from 'vitest'
import { normaliseContent } from './normalise'

/** The same cases as the server's TextContentTests, so both sides agree. */
describe('normaliseContent', () => {
  it.each([
    ['one\r\ntwo\rthree', 'one\ntwo\nthree'],
    ['a\tb\t\tc', 'a b  c'],
    ['line one   \nline two\t \n', 'line one\nline two'],
    ['\n\n  \r\n  indented\n\nnext\n \n\n', '  indented\n\nnext'],
    ['第一段。\u3000\r\n第二段。', '第一段。\n第二段。'],
    ['already clean', 'already clean'],
  ])('makes every character of %j typable', (raw, expected) => {
    expect(normaliseContent(raw)).toBe(expected)
  })

  it('is idempotent', () => {
    const once = normaliseContent(' \r\n\tx \u00a0\r\n\r\n y\t\r\n')
    expect(normaliseContent(once)).toBe(once)
  })

  it('keeps a byte order mark, which .NET does not count as whitespace', () => {
    expect(normaliseContent('a\ufeff')).toBe('a\ufeff')
  })

  it('treats null and undefined as empty', () => {
    expect(normaliseContent(null)).toBe('')
    expect(normaliseContent(undefined)).toBe('')
  })
})
