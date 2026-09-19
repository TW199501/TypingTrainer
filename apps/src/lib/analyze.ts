import { SUB_HINTS } from '@/data/constants'
import type { AnalysisResult } from '@/data/types'

/**
 * Local stand-in for the AI intake call: guesses language, group, topic and
 * level from the raw text. The real build swaps this for the model configured
 * on the AI page; the shape of the result stays the same.
 */
export function analyzeText(text: string): AnalysisResult | null {
  const src = (text || '').trim()
  if (!src) return null

  const han = (src.match(/[一-鿿]/g) || []).length
  const sym = (src.match(/[^\w\s一-鿿]/g) || []).length
  const code = /(const |let |function |class |SELECT |=>|\{|\};)/.test(src)

  const category = code ? 'Code' : han > src.length * 0.2 ? 'Chinese' : 'English'
  let subName = code
    ? /SELECT|FROM|WHERE/i.test(src)
      ? 'SQL'
      : /using |namespace|public /.test(src)
        ? 'C#'
        : 'JavaScript'
    : category === 'Chinese'
      ? 'Daily talk'
      : 'Literature'
  ;(SUB_HINTS[category] || []).some(([re, name]) => {
    if (re.test(src)) {
      subName = name
      return true
    }
    return false
  })

  const ratio = sym / Math.max(1, src.length)
  const level = 'L' + Math.min(6, Math.max(1, Math.round(1 + ratio * 14 + src.length / 400)))
  const rawTxt = src.replace(/\s+/g, ' ')

  return {
    title: rawTxt.length > 18 ? rawTxt.slice(0, 18) + '…' : rawTxt,
    category,
    sub: subName,
    level,
    chars: src.length,
    reason:
      'Language: ' +
      (han ? 'Chinese' : 'English') +
      ' · filed under ' +
      category +
      ' › ' +
      subName +
      ' · symbol density ' +
      Math.round(ratio * 100) +
      '%' +
      ' · suggested level ' +
      level +
      '.',
  }
}
