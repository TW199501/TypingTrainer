/**
 * Engine constants: keyboard geometry, finger map, bopomofo layout and the
 * offline practice corpus. Anything that is *data* (categories, dictionary,
 * trends, error rates) comes from the API layer instead — see src/api.
 */
import type { Category } from './types'

/* ------------------------------------------------------------------ fingers */

export type Finger = 'pinkyL' | 'ringL' | 'midL' | 'idxL' | 'idxR' | 'midR' | 'ringR' | 'pinkyR' | 'thumb'

export const FING: Record<Finger, string> = {
  pinkyL: '#b4553c',
  ringL: '#c08552',
  midL: '#8a9a5b',
  idxL: '#6f8f85',
  idxR: '#d9a05b',
  midR: '#8a9a5b',
  ringR: '#c08552',
  pinkyR: '#b4553c',
  thumb: '#c4bdb1',
}

export const FMAP: Record<string, Finger> = {}
const assign = (keys: string, fg: Finger) =>
  keys.split(' ').forEach((k) => {
    FMAP[k] = fg
  })
assign('` 1 q a z tab caps shift-l', 'pinkyL')
assign('2 w s x', 'ringL')
assign('3 e d c', 'midL')
assign('4 5 r t f g v b', 'idxL')
assign('6 7 y u h j n m', 'idxR')
assign('8 i k ,', 'midR')
assign('9 o l .', 'ringR')
assign("0 - = p [ ] \\ ; ' / enter backspace shift-r", 'pinkyR')
assign('space', 'thumb')

/* ----------------------------------------------------------------- keyboard */

export type KeyDef = [id: string, width: number, label?: string]

export const ROWS: KeyDef[][] = [
  [
    ['`', 44],
    ['1', 44],
    ['2', 44],
    ['3', 44],
    ['4', 44],
    ['5', 44],
    ['6', 44],
    ['7', 44],
    ['8', 44],
    ['9', 44],
    ['0', 44],
    ['-', 44],
    ['=', 44],
    ['backspace', 80, 'Back'],
  ],
  [
    ['tab', 66, 'Tab'],
    ['q', 44],
    ['w', 44],
    ['e', 44],
    ['r', 44],
    ['t', 44],
    ['y', 44],
    ['u', 44],
    ['i', 44],
    ['o', 44],
    ['p', 44],
    ['[', 44],
    [']', 44],
    ['\\', 58],
  ],
  [
    ['caps', 80, 'Caps'],
    ['a', 44],
    ['s', 44],
    ['d', 44],
    ['f', 44],
    ['g', 44],
    ['h', 44],
    ['j', 44],
    ['k', 44],
    ['l', 44],
    [';', 44],
    ["'", 44],
    ['enter', 94, 'Enter'],
  ],
  [
    ['shift-l', 110, 'Shift'],
    ['z', 44],
    ['x', 44],
    ['c', 44],
    ['v', 44],
    ['b', 44],
    ['n', 44],
    ['m', 44],
    [',', 44],
    ['.', 44],
    ['/', 44],
    ['shift-r', 114, 'Shift'],
  ],
  [['space', 360, 'Space']],
]

/** Total unit width a full row is laid out against; the remainder pads both ends. */
export const ROW_UNITS = 652

export const SHIFTED: Record<string, string> = {
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
}

/** Dachen (大千) bopomofo layout. */
export const ZHUYIN: Record<string, string> = {
  '1': 'ㄅ',
  q: 'ㄆ',
  a: 'ㄇ',
  z: 'ㄈ',
  '2': 'ㄉ',
  w: 'ㄊ',
  s: 'ㄋ',
  x: 'ㄌ',
  e: 'ㄍ',
  d: 'ㄎ',
  c: 'ㄏ',
  r: 'ㄐ',
  f: 'ㄑ',
  v: 'ㄒ',
  '5': 'ㄓ',
  t: 'ㄔ',
  g: 'ㄕ',
  b: 'ㄖ',
  y: 'ㄗ',
  h: 'ㄘ',
  n: 'ㄙ',
  u: 'ㄧ',
  j: 'ㄨ',
  m: 'ㄩ',
  '8': 'ㄚ',
  i: 'ㄛ',
  k: 'ㄜ',
  ',': 'ㄝ',
  '9': 'ㄞ',
  o: 'ㄟ',
  l: 'ㄠ',
  '.': 'ㄡ',
  '0': 'ㄢ',
  p: 'ㄣ',
  ';': 'ㄤ',
  '/': 'ㄥ',
  '-': 'ㄦ',
  '3': 'ˇ',
  '4': 'ˋ',
  '6': 'ˊ',
  '7': '˙',
}

export const ZH_REV: Record<string, string> = {}
Object.keys(ZHUYIN).forEach((k) => {
  if (!ZH_REV[ZHUYIN[k]]) ZH_REV[ZHUYIN[k]] = k
})

/* -------------------------------------------------------------------- texts */

export interface TextGroup {
  items: string[]
}

export const TEXTS: Record<string, TextGroup> = {
  basic: {
    items: [
      'asdf jkl; asdf jkl; fjdk slas dkfj gh',
      'the quick fox jumps over a lazy dog by the river',
      'sad lads ask dad; fall glass half gaff jail',
    ],
  },
  english: {
    items: [
      'Design is not just what it looks like and feels like. Design is how it works. A good interface disappears into the task, leaving the person free to think about the work itself.',
      'Typing well is a quiet skill. It rewards patience over speed, accuracy over bursts, and steady daily practice over a single long session.',
    ],
  },
  chinese: {
    items: [
      '打字練習的重點不在速度，而在穩定。每天固定練十分鐘，手指會自己記住位置，速度自然跟上來。',
      '好的介面會消失在任務裡，讓人專心想事情本身，而不是想著手上的工具怎麼操作。',
    ],
  },
  zhuyin: {
    items: [
      'ㄅㄆㄇㄈ ㄉㄊㄋㄌ ㄍㄎㄏ ㄐㄑㄒ',
      'ㄓㄔㄕㄖ ㄗㄘㄙ ㄧㄨㄩ ㄚㄛㄜㄝ',
      'ㄞㄟㄠㄡ ㄢㄣㄤㄥ ㄦ ˊˇˋ˙',
    ],
  },
  bilingual: { items: [] },
  code: {
    items: [
      'const wpm = (chars, ms) => Math.round((chars / 5) / (ms / 60000));',
      'if (typed[i] !== target[i]) { errors.set(target[i], (errors.get(target[i]) ?? 0) + 1); }',
      'SELECT UserId, AVG(WPM) FROM Sessions WHERE CreatedAt > @start GROUP BY UserId;',
    ],
  },
  timed: {
    items: [
      'A calm mind types faster than a rushed one. Focus on the next character, not the whole paragraph, and the speed will follow on its own.',
    ],
  },
  custom: {
    items: ['Paste your own paragraph here to practise exactly the words you write every day at work.'],
  },
}

/* --------------------------------------------------------------- categories */

export const catTotal = (c: Category): number => (c.children || []).reduce((a, x) => a + x.count, 0)

/** Design-system tag hue per group, mapped to the antd preset names. */
export const TAG_BY_CAT: Record<string, string> = {
  Vocabulary: 'cyan',
  Code: 'magenta',
  English: 'volcano',
  Chinese: 'red',
  Bopomofo: 'orange',
  Basics: 'lime',
  Timed: 'gold',
}

export const SUB_HINTS: Record<string, [RegExp, string][]> = {
  Chinese: [
    [/營收|股|財報|匯率|利率|投資/, 'Finance'],
    [/借方|貸方|科目|帳|折舊|分錄/, 'Accounting'],
    [/公告|函|核定|辦理|主旨|說明/, 'Official'],
    [/記者|報導|表示|昨日|今日/, 'News'],
  ],
  English: [
    [/account|transfer|balance|bank|payment/i, 'Banking'],
    [/click|login|sign up|page|website|menu/i, 'Web'],
    [/dear|regards|thank you for|apolog/i, 'Support email'],
    [/meeting|proposal|quarter|invoice/i, 'Business email'],
  ],
}

/* ------------------------------------------------------------------ heatmap */

export const HEAT_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]

/* ----------------------------------------------------------------------- AI */

export type Provider = 'Claude' | 'OpenAI' | 'Gemini' | 'Custom'

export const MODELS: Record<Provider, [id: string, label: string][]> = {
  Claude: [
    ['claude-sonnet-4-5', 'Claude Sonnet 4.5（recommended）'],
    ['claude-opus-4-1', 'Claude Opus 4.1'],
    ['claude-haiku-4-5', 'Claude Haiku 4.5（fast）'],
  ],
  OpenAI: [
    ['gpt-4.1-mini', 'GPT-4.1 mini（recommended）'],
    ['gpt-4.1', 'GPT-4.1'],
    ['gpt-4o-mini', 'GPT-4o mini（fast）'],
  ],
  Gemini: [
    ['gemini-2.5-flash', 'Gemini 2.5 Flash（recommended）'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ],
  Custom: [
    ['qwen2.5-7b', 'Qwen2.5 7B (Ollama)'],
    ['llama3.1-8b', 'Llama 3.1 8B'],
    ['breeze-7b', 'Breeze 7B (zh-TW)'],
    ['custom', 'Custom model ID'],
  ],
}

export const BASE_URL: Record<Provider, string> = {
  Claude: 'https://api.anthropic.com/v1',
  OpenAI: 'https://api.openai.com/v1',
  Gemini: 'https://generativelanguage.googleapis.com/v1beta',
  Custom: 'http://localhost:11434/v1',
}

/* ------------------------------------------------------------- spaced repetition */

export const SRS_DAYS = [1, 2, 4, 7, 15, 30]
