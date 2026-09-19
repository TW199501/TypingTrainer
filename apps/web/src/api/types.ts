/**
 * Wire types. These mirror the ASP.NET Core contract in docs/api-contract.md —
 * keep both sides in step when an endpoint changes.
 */

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthUserDto {
  id: number
  username: string
  keyboardLayout: string
  token: string
}

export interface SubCategoryDto {
  id: string
  name: string
  count: number
}

export interface CategoryDto {
  id: string
  name: string
  color: string
  /** Which keyboard the group is typed on. */
  layout: 'en' | 'zh' | 'zhuyin'
  kind: 'basic' | 'english' | 'chinese' | 'zhuyin' | 'bilingual' | 'code' | 'timed' | 'custom'
  children: SubCategoryDto[]
}

export interface TextDto {
  id: number
  title: string
  category: string
  sub: string
  level: string
  chars: number
  /** Personal best for this text; `null` until it has been drilled once. */
  best: number | null
  lastPractisedAt: string | null
  content?: string
}

export interface DictEntryDto {
  id: number
  word: string
  phonetic: string
  pos: string
  zh: string
  topic: string
  example: string
  mastery: number
}

/** One physical key event, sent with the run so the server can re-verify the score. */
export interface KeystrokeDto {
  k: string
  /** Milliseconds since the run started. */
  t: number
  ok: boolean
}

export interface SessionSubmitDto {
  textId: number | null
  mode: string
  /** Latin runs report WPM, Chinese runs report CPM; `unit` says which. */
  speed: number
  unit: 'wpm' | 'cpm'
  accuracy: number
  durationSec: number
  errorCount: number
  keyErrors: { key: string; count: number }[]
  keystrokes: KeystrokeDto[]
}

export interface SessionResultDto {
  id: number
  isPersonalBest: boolean
}

export interface StatsSummaryDto {
  englishWpm: number
  englishDelta: number
  chineseCpm: number
  chineseDelta: number
  accuracy: number
  accuracyDelta: number
  personalBest: number
  personalBestOn: string
  personalBestCategory: string
}

export interface TrendPointDto {
  date: string
  speed: number
  accuracy: number
}

export interface HistoryItemDto {
  id: number
  category: string
  tagColor: string
  speed: number
  unit: 'WPM' | 'CPM'
  accuracy: number
  when: string
}

export interface KeyErrorRateDto {
  key: string
  rate: number
}

export interface LeaderboardRowDto {
  rank: number
  name: string
  speed: number
  accuracy: number
  runs: number
  isMe: boolean
}

export interface CompareRowDto {
  /** i18n key suffix under `progress.rows`. */
  key: string
  now: number
  prev: number
  unit: string
}

export interface PersonalBestDto {
  title: string
  category: string
  best: number
  prev: number
  when: string
}

export interface BookEntryDto {
  ch: string
  total: number
  box: number
  dueIn: number
}

export interface RecommendationDto {
  id: string
  level: string
  /** i18n key suffix under `coach.items`. */
  key: string
  category: string
  tagColor: string
  mode: string
  sub?: string
}

export interface CoachDto {
  level: string
  sessions: number
  days: number
  suggestedLevel: string
  projectedWpm: number
  projectedRange: string
  dailyTargetMinutes: number
  dailyTargetDrills: number
  recommended: RecommendationDto[]
}
