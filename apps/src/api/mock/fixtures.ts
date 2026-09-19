/**
 * Sample data that stands in for the API while `VITE_USE_MOCK` is on.
 * Everything here is shaped exactly like the wire DTOs, so switching the flag
 * off changes the source of the data and nothing else.
 */
import type {
  BookEntryDto,
  CategoryDto,
  CoachDto,
  CompareRowDto,
  DictEntryDto,
  HistoryItemDto,
  KeyErrorRateDto,
  LeaderboardRowDto,
  ModelStorageDto,
  PersonalBestDto,
  PromptDto,
  StatsSummaryDto,
  SubCategoryDto,
  TextDto,
  TrendPointDto,
} from '../types'

const subs = (arr: [string, number][]): SubCategoryDto[] =>
  arr.map(([name, count]) => ({ id: name, name, count }))

export const CATEGORIES: CategoryDto[] = [
  {
    id: 'basic',
    name: 'Basics',
    color: '#8a9a5b',
    layout: 'en',
    kind: 'basic',
    children: subs([
      ['Home row', 6],
      ['Top row', 5],
      ['Bottom row', 5],
      ['Numbers', 4],
      ['Symbols', 4],
    ]),
  },
  {
    id: 'english',
    name: 'English',
    color: '#d97757',
    layout: 'en',
    kind: 'english',
    children: subs([
      ['Web', 8],
      ['Banking', 5],
      ['Support email', 7],
      ['Business email', 6],
      ['Tech news', 9],
      ['Literature', 3],
    ]),
  },
  {
    id: 'chinese',
    name: 'Chinese',
    color: '#b06a4f',
    layout: 'zh',
    kind: 'chinese',
    children: subs([
      ['Finance', 6],
      ['Accounting', 4],
      ['News', 7],
      ['Official', 5],
      ['Literature', 4],
      ['Daily talk', 5],
    ]),
  },
  {
    id: 'zhuyin',
    name: 'Bopomofo',
    color: '#a8763e',
    layout: 'zhuyin',
    kind: 'zhuyin',
    children: subs([
      ['Initials', 4],
      ['Finals', 4],
      ['Tones', 2],
      ['Mixed', 2],
    ]),
  },
  {
    id: 'bilingual',
    name: 'Vocabulary',
    color: '#6f8f85',
    layout: 'zh',
    kind: 'bilingual',
    children: subs([
      ['Banking', 4],
      ['Accounting', 3],
      ['IT', 3],
      ['Meetings', 2],
      ['Daily life', 2],
    ]),
  },
  {
    id: 'code',
    name: 'Code',
    color: '#7d8c5c',
    layout: 'en',
    kind: 'code',
    children: subs([
      ['C#', 6],
      ['JavaScript', 7],
      ['SQL', 6],
    ]),
  },
  {
    id: 'timed',
    name: 'Timed',
    color: '#c08552',
    layout: 'en',
    kind: 'timed',
    children: subs([
      ['1 min', 3],
      ['3 min', 3],
      ['5 min', 2],
    ]),
  },
]

export const TEXTS: TextDto[] = [
  {
    id: 1,
    title: 'Q3 revenue outlook',
    category: 'Chinese',
    sub: 'Finance',
    level: 'L4',
    chars: 412,
    best: 52,
    lastPractisedAt: 'Today',
  },
  {
    id: 2,
    title: 'SQL query drills #12',
    category: 'Code',
    sub: 'SQL',
    level: 'L6',
    chars: 286,
    best: 63,
    lastPractisedAt: 'Yesterday',
  },
  {
    id: 3,
    title: 'Refund reply template',
    category: 'English',
    sub: 'Support email',
    level: 'L3',
    chars: 534,
    best: 74,
    lastPractisedAt: 'Sep 16',
  },
  {
    id: 4,
    title: 'Memo: annual stocktake',
    category: 'Chinese',
    sub: 'Official',
    level: 'L4',
    chars: 365,
    best: 48,
    lastPractisedAt: 'Sep 16',
  },
  {
    id: 5,
    title: 'Bopomofo: ㄓㄔㄕㄖ drill',
    category: 'Bopomofo',
    sub: 'Initials',
    level: 'L2',
    chars: 96,
    best: 44,
    lastPractisedAt: 'Sep 15',
  },
  {
    id: 6,
    title: 'C# exception handling',
    category: 'Code',
    sub: 'C#',
    level: 'L6',
    chars: 238,
    best: 58,
    lastPractisedAt: 'Sep 15',
  },
  {
    id: 7,
    title: 'FX and fee vocabulary ×30',
    category: 'Vocabulary',
    sub: 'Banking',
    level: 'L3',
    chars: 268,
    best: 61,
    lastPractisedAt: 'Sep 14',
  },
  {
    id: 8,
    title: 'Key drill: semicolon and slash',
    category: 'Basics',
    sub: 'Symbols',
    level: 'L5',
    chars: 96,
    best: 69,
    lastPractisedAt: 'Sep 13',
  },
  {
    id: 9,
    title: 'AI chip supply chain report',
    category: 'English',
    sub: 'Tech news',
    level: 'L4',
    chars: 478,
    best: 72,
    lastPractisedAt: 'Sep 09',
  },
]

export const DICTIONARY: DictEntryDto[] = [
  {
    id: 1,
    word: 'exchange rate',
    phonetic: '/ɪksˈtʃeɪndʒ reɪt/',
    pos: 'n.',
    zh: '匯率',
    topic: 'Banking',
    example: 'The exchange rate today is lower than the rate we locked last week.',
    mastery: 72,
  },
  {
    id: 2,
    word: 'interest rate',
    phonetic: '/ˈɪntrəst reɪt/',
    pos: 'n.',
    zh: '利率',
    topic: 'Banking',
    example: 'The central bank kept the interest rate unchanged this quarter.',
    mastery: 64,
  },
  {
    id: 3,
    word: 'remittance',
    phonetic: '/rɪˈmɪtns/',
    pos: 'n.',
    zh: '匯款',
    topic: 'Banking',
    example: 'Please keep the remittance slip until the transfer is confirmed.',
    mastery: 38,
  },
  {
    id: 4,
    word: 'balance',
    phonetic: '/ˈbæləns/',
    pos: 'n.',
    zh: '餘額',
    topic: 'Banking',
    example: 'Check the balance of your savings account before you apply.',
    mastery: 81,
  },
  {
    id: 5,
    word: 'reconcile',
    phonetic: '/ˈrekənsaɪl/',
    pos: 'v.',
    zh: '對帳',
    topic: 'Accounting',
    example: 'The accountant will reconcile the invoice with the monthly statement.',
    mastery: 45,
  },
  {
    id: 6,
    word: 'depreciation',
    phonetic: '/dɪˌpriːʃiˈeɪʃn/',
    pos: 'n.',
    zh: '折舊',
    topic: 'Accounting',
    example: 'Depreciation is recorded on a straight line basis over five years.',
    mastery: 29,
  },
  {
    id: 7,
    word: 'receivable',
    phonetic: '/rɪˈsiːvəbl/',
    pos: 'n.',
    zh: '應收帳款',
    topic: 'Accounting',
    example: 'Accounts receivable rose slightly because of the new payment terms.',
    mastery: 41,
  },
  {
    id: 8,
    word: 'deployment',
    phonetic: '/dɪˈplɔɪmənt/',
    pos: 'n.',
    zh: '部署',
    topic: 'IT',
    example: 'The deployment failed because the migration script timed out.',
    mastery: 58,
  },
  {
    id: 9,
    word: 'latency',
    phonetic: '/ˈleɪtnsi/',
    pos: 'n.',
    zh: '延遲',
    topic: 'IT',
    example: 'Average latency dropped to forty milliseconds after the cache change.',
    mastery: 52,
  },
  {
    id: 10,
    word: 'rollback',
    phonetic: '/ˈrəʊlbæk/',
    pos: 'n.',
    zh: '還原',
    topic: 'IT',
    example: 'We prepared a rollback plan in case the release breaks checkout.',
    mastery: 47,
  },
  {
    id: 11,
    word: 'agenda',
    phonetic: '/əˈdʒendə/',
    pos: 'n.',
    zh: '議程',
    topic: 'Meetings',
    example: 'Please send the agenda and the meeting notes before Friday.',
    mastery: 76,
  },
  {
    id: 12,
    word: 'follow-up',
    phonetic: '/ˈfɒləʊ ʌp/',
    pos: 'n.',
    zh: '後續追蹤',
    topic: 'Meetings',
    example: 'I will schedule a follow-up with the vendor next Tuesday.',
    mastery: 69,
  },
  {
    id: 13,
    word: 'appointment',
    phonetic: '/əˈpɔɪntmənt/',
    pos: 'n.',
    zh: '預約',
    topic: 'Daily life',
    example: 'I made an appointment with the dentist for Monday morning.',
    mastery: 83,
  },
  {
    id: 14,
    word: 'receipt',
    phonetic: '/rɪˈsiːt/',
    pos: 'n.',
    zh: '收據',
    topic: 'Daily life',
    example: 'Keep the receipt in case you want to return the jacket.',
    mastery: 74,
  },
]

export const SUMMARY: StatsSummaryDto = {
  englishWpm: 64,
  englishDelta: 6,
  chineseCpm: 42,
  chineseDelta: 4,
  accuracy: 96.4,
  accuracyDelta: 1.2,
  personalBest: 78,
  personalBestOn: 'Sep 14',
  personalBestCategory: 'Code',
}

const day = (i: number) => {
  const d = new Date(2026, 7, 21)
  d.setDate(d.getDate() + i)
  return d.toISOString().slice(0, 10)
}

export const TREND_EN: TrendPointDto[] = Array.from({ length: 30 }, (_, i) => ({
  date: day(i),
  speed: Math.round(48 + i * 0.85 + Math.sin(i * 1.7) * 4),
  accuracy: Math.round(920 + i * 1.6 + Math.sin(i * 2.3) * 18) / 10,
}))

export const TREND_ZH: TrendPointDto[] = Array.from({ length: 30 }, (_, i) => ({
  date: day(i),
  speed: Math.round(31 + i * 0.52 + Math.sin(i * 1.3) * 3),
  accuracy: Math.round(905 + i * 1.9 + Math.sin(i * 1.9) * 22) / 10,
}))

export const HISTORY: HistoryItemDto[] = [
  {
    id: 1,
    category: 'Code',
    tagColor: 'magenta',
    speed: 78,
    unit: 'WPM',
    accuracy: 95.2,
    when: 'Today 09:12',
  },
  {
    id: 2,
    category: 'Chinese',
    tagColor: 'red',
    speed: 46,
    unit: 'CPM',
    accuracy: 94.6,
    when: 'Today 09:02',
  },
  {
    id: 3,
    category: 'English',
    tagColor: 'volcano',
    speed: 71,
    unit: 'WPM',
    accuracy: 97.8,
    when: 'Today 08:40',
  },
  { id: 4, category: 'Timed', tagColor: 'gold', speed: 66, unit: 'WPM', accuracy: 94.1, when: 'Yesterday' },
  { id: 5, category: 'Chinese', tagColor: 'red', speed: 41, unit: 'CPM', accuracy: 93.2, when: 'Yesterday' },
  { id: 6, category: 'Basics', tagColor: 'lime', speed: 59, unit: 'WPM', accuracy: 98.5, when: 'Yesterday' },
  { id: 7, category: 'English', tagColor: 'volcano', speed: 63, unit: 'WPM', accuracy: 96.0, when: 'Sep 17' },
]

/** Per-key error rate driving the heatmap. */
export const KEY_ERRORS: KeyErrorRateDto[] = Object.entries({
  q: 0.04,
  w: 0.06,
  e: 0.02,
  r: 0.03,
  t: 0.02,
  y: 0.08,
  u: 0.05,
  i: 0.03,
  o: 0.04,
  p: 0.11,
  a: 0.02,
  s: 0.03,
  d: 0.01,
  f: 0.01,
  g: 0.05,
  h: 0.04,
  j: 0.02,
  k: 0.07,
  l: 0.06,
  ';': 0.14,
  z: 0.12,
  x: 0.1,
  c: 0.05,
  v: 0.07,
  b: 0.09,
  n: 0.04,
  m: 0.06,
  ',': 0.08,
  '.': 0.05,
  '/': 0.13,
}).map(([key, rate]) => ({ key, rate }))

export const LEADERBOARD_EN: LeaderboardRowDto[] = [
  ['lin.yu', 92, 98.4, 31],
  ['chen.wei', 78, 95.2, 24],
  ['a.kuo', 75, 97.1, 19],
  ['ming.h', 71, 96.6, 28],
  ['sara.t', 69, 94.8, 15],
  ['j.hsu', 66, 97.9, 22],
  ['peng.l', 64, 93.5, 11],
  ['wu.dan', 61, 95.0, 17],
].map((r, i) => ({
  rank: i + 1,
  name: r[0] as string,
  speed: r[1] as number,
  accuracy: r[2] as number,
  runs: r[3] as number,
  isMe: r[0] === 'chen.wei',
}))

export const LEADERBOARD_ZH: LeaderboardRowDto[] = [
  ['wu.dan', 58, 96.2, 14],
  ['chen.wei', 52, 94.7, 11],
  ['lin.yu', 49, 97.5, 18],
  ['ming.h', 46, 95.8, 9],
  ['a.kuo', 44, 93.9, 12],
  ['sara.t', 41, 96.4, 7],
  ['j.hsu', 38, 94.1, 6],
  ['peng.l', 35, 92.8, 5],
].map((r, i) => ({
  rank: i + 1,
  name: r[0] as string,
  speed: r[1] as number,
  accuracy: r[2] as number,
  runs: r[3] as number,
  isMe: r[0] === 'chen.wei',
}))

export const compareRows = (period: 'weekly' | 'monthly'): CompareRowDto[] => {
  const w = period === 'weekly'
  return [
    { key: 'avgWpm', now: w ? 64 : 61, prev: w ? 58 : 52, unit: '' },
    { key: 'bestWpm', now: 78, prev: w ? 73 : 69, unit: '' },
    { key: 'chineseCpm', now: 42, prev: w ? 38 : 34, unit: '' },
    { key: 'accuracy', now: 96.4, prev: w ? 95.2 : 94.1, unit: '%' },
    { key: 'runs', now: w ? 31 : 118, prev: w ? 24 : 96, unit: '' },
    { key: 'time', now: w ? 2.6 : 9.8, prev: w ? 2.1 : 8.4, unit: 'h' },
  ]
}

export const PERSONAL_BESTS: PersonalBestDto[] = [
  { title: 'Q3 revenue outlook', category: 'Chinese › Finance', best: 52, prev: 45, when: 'Today' },
  { title: 'SQL query drills #12', category: 'Code › SQL', best: 63, prev: 58, when: 'Yesterday' },
  { title: 'Refund reply template', category: 'English › Support email', best: 74, prev: 74, when: 'Sep 16' },
  {
    title: 'AI chip supply chain report',
    category: 'English › Tech news',
    best: 72,
    prev: 66,
    when: 'Sep 09',
  },
  { title: 'FX and fee vocabulary', category: 'Vocabulary › Banking', best: 61, prev: 54, when: 'Sep 14' },
]

export const BOOK: BookEntryDto[] = [
  { ch: ';', total: 14, box: 1, dueIn: 0 },
  { ch: '/', total: 11, box: 2, dueIn: 0 },
  { ch: 'z', total: 9, box: 2, dueIn: 1 },
  { ch: 'p', total: 7, box: 3, dueIn: 3 },
  { ch: 'x', total: 6, box: 4, dueIn: 6 },
]

export const COACH: CoachDto = {
  level: 'B+',
  sessions: 32,
  days: 14,
  suggestedLevel: 'Level 5',
  projectedWpm: 64,
  projectedRange: '58–71',
  dailyTargetMinutes: 12,
  dailyTargetDrills: 4,
  recommended: [
    { id: 'symbols', level: 'L5', key: 'symbols', category: 'Basics', tagColor: 'lime', mode: 'basic' },
    { id: 'arrow', level: 'L5', key: 'arrow', category: 'Code', tagColor: 'magenta', mode: 'code' },
    {
      id: 'banking',
      level: 'L4',
      key: 'banking',
      category: 'Vocabulary',
      tagColor: 'cyan',
      mode: 'bilingual',
      sub: 'Banking',
    },
    { id: 'timed', level: 'L6', key: 'timed', category: 'Timed', tagColor: 'gold', mode: 'timed' },
  ],
}

/**
 * Mirrors GET /models. The directory is a placeholder: with no backend there is
 * no real one, and at runtime the Tauri shell overwrites it with the actual
 * path on desktop. Notes follow `?locale=` the same way the API does.
 */
const MODEL_NOTES: Record<string, Record<string, string>> = {
  'jieba-zh-tw': {
    en: 'Traditional Chinese segmentation',
    'zh-TW': '繁體中文分詞',
    'zh-CN': '繁体中文分词',
  },
  'bge-m3': {
    en: 'Multilingual vectors for semantic search',
    'zh-TW': '多語語意搜尋向量',
    'zh-CN': '多语语义搜索向量',
  },
  'text2vec-base-chinese': {
    en: 'Lightweight Chinese vectors',
    'zh-TW': '輕量中文向量',
    'zh-CN': '轻量中文向量',
  },
  'bge-reranker-v2-m3': {
    en: 'High-precision result reranking',
    'zh-TW': '高精度結果重排序',
    'zh-CN': '高精度结果重排序',
  },
  'jina-reranker-v2-tiny': {
    en: 'Lightweight rerank, realtime on desktop',
    'zh-TW': '輕量重排序，桌面即時可用',
    'zh-CN': '轻量重排序，桌面实时可用',
  },
}

const MODEL_ROWS: Omit<ModelStorageDto['models'][number], 'note'>[] = [
  { code: 'jieba-zh-tw', name: 'jieba-zh-tw', kind: 'Token', mb: 42, installed: true },
  { code: 'bge-m3', name: 'bge-m3', kind: 'Embed', mb: 2200, installed: true },
  { code: 'text2vec-base-chinese', name: 'text2vec-base-chinese', kind: 'Embed', mb: 410, installed: false },
  { code: 'bge-reranker-v2-m3', name: 'bge-reranker-v2-m3', kind: 'Rerank', mb: 1100, installed: false },
  { code: 'jina-reranker-v2-tiny', name: 'jina-reranker-v2-tiny', kind: 'Rerank', mb: 280, installed: false },
]

function catalogueLocale(locale: string): 'en' | 'zh-TW' | 'zh-CN' {
  return locale === 'zh-TW' || locale === 'zh-CN' ? locale : 'en'
}

export function modelStorage(locale = 'en'): ModelStorageDto {
  const tag = catalogueLocale(locale)
  return {
    directory: '~/TypeLab/models',
    writable: true,
    usedMb: 2242,
    models: MODEL_ROWS.map((m) => ({
      ...m,
      note: MODEL_NOTES[m.code]?.[tag] ?? MODEL_NOTES[m.code]?.en ?? '',
    })),
  }
}

/** English snapshot; prefer <see cref="modelStorage"/> when a locale is known. */
export const MODEL_STORAGE: ModelStorageDto = modelStorage('en')

const PROMPT_COPY: Record<
  string,
  { name: Record<string, string>; description: Record<string, string>; content: string }
> = {
  categorise: {
    name: { en: 'Categorise', 'zh-TW': '分類', 'zh-CN': '分类' },
    description: {
      en: 'Files a pasted or imported text into group, topic and level.',
      'zh-TW': '將貼上或匯入的文本歸入大類、細項與難度。',
      'zh-CN': '将粘贴或导入的文本归入大类、细项与难度。',
    },
    content:
      'Detect the language and topic, then return a title (max 18 chars), group, topic and an L1–L6 level with a one-line rationale.',
  },
  examples: {
    name: { en: 'Examples', 'zh-TW': '例句', 'zh-CN': '例句' },
    description: {
      en: 'Generates an example sentence for a dictionary term.',
      'zh-TW': '為字典詞彙產生一句實用例句。',
      'zh-CN': '为词典词条生成一句实用例句。',
    },
    content:
      'Write one practical 12–18 word sentence for the given term in a workplace context, with a Traditional Chinese translation.',
  },
  rewrite: {
    name: { en: 'Rewrite', 'zh-TW': '改寫', 'zh-CN': '改写' },
    description: {
      en: 'Rewrites a text to drill the keys the learner misses most.',
      'zh-TW': '把最常打錯的鍵自然織進文本，供針對練習。',
      'zh-CN': '把最常打错的键自然织进文本，供针对练习。',
    },
    content:
      'Weave the user’s most-missed keys naturally into the text, keeping it readable and about the same length.',
  },
  level: {
    name: { en: 'Level', 'zh-TW': '難度', 'zh-CN': '难度' },
    description: {
      en: 'Scores typing difficulty.',
      'zh-TW': '評定打字難度（L1–L6）。',
      'zh-CN': '评定打字难度（L1–L6）。',
    },
    content: 'Score L1–L6 from sentence length, symbol density and rare-word ratio, with a one-line reason.',
  },
  'segment.zh': {
    name: { en: 'Chinese segmentation', 'zh-TW': '中文分詞', 'zh-CN': '中文分词' },
    description: {
      en: 'Splits a Chinese practice text into the units a learner types as one chunk, with part of speech and bopomofo.',
      'zh-TW': '把中文練習文本切成一次打完的單位，並標詞性與注音。',
      'zh-CN': '把中文练习文本切成一次打完的单位，并标词性与拼音。',
    },
    content:
      'You segment Chinese text for a typing trainer. The learner types the text character by character; your job is to mark the word boundaries that per-word accuracy and the bopomofo prompt are measured against.',
  },
}

export function prompts(locale = 'en'): PromptDto[] {
  const tag = catalogueLocale(locale)
  return Object.entries(PROMPT_COPY).map(([code, row]) => ({
    code,
    name: row.name[tag] ?? row.name.en,
    description: row.description[tag] ?? row.description.en,
    content: row.content,
    isBuiltIn: true,
  }))
}
