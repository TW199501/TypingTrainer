import { describe, expect, it } from 'vitest'
import { decodeText, readTextFile } from './decode'

const utf8 = (s: string) => new TextEncoder().encode(s)
/** 「中文」 in Big5. */
const BIG5_ZHONGWEN = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5])

describe('decodeText', () => {
  it('reads UTF-8', () => {
    expect(decodeText(utf8('中文 text'))).toBe('中文 text')
  })

  it('drops a UTF-8 byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('中文')])
    expect(decodeText(bytes)).toBe('中文')
  })

  it('falls back to Big5 when the bytes are not valid UTF-8', () => {
    expect(decodeText(BIG5_ZHONGWEN)).toBe('中文')
  })

  it('accepts an ArrayBuffer', () => {
    expect(decodeText(utf8('abc').buffer as ArrayBuffer)).toBe('abc')
  })
})

describe('readTextFile', () => {
  it('reads a Big5 file into text', async () => {
    const file = new File([BIG5_ZHONGWEN], 'old.txt', { type: 'text/plain' })
    expect(await readTextFile(file)).toBe('中文')
  })
})
