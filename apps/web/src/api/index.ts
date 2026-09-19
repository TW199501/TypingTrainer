import { delay, http, USE_MOCK, writeToken } from './http'
import * as fx from './mock/fixtures'
import type {
  AuthUserDto,
  BookEntryDto,
  CategoryDto,
  CoachDto,
  CompareRowDto,
  DictEntryDto,
  HistoryItemDto,
  KeyErrorRateDto,
  LeaderboardRowDto,
  LoginRequest,
  PersonalBestDto,
  SessionResultDto,
  SessionSubmitDto,
  StatsSummaryDto,
  TextDto,
  TrendPointDto,
} from './types'

/** `VITE_USE_MOCK` decides per call whether the fixture or the endpoint answers. */
async function pick<T>(mock: () => T, real: () => Promise<{ data: T }>): Promise<T> {
  if (USE_MOCK) return delay(mock())
  const res = await real()
  return res.data
}

export const api = {
  auth: {
    async login(body: LoginRequest): Promise<AuthUserDto> {
      const user = await pick(
        () => ({ id: 1, username: body.username, keyboardLayout: 'QWERTY', token: 'mock-token' }),
        () => http.post<AuthUserDto>('/auth/login', body),
      )
      writeToken(user.token)
      return user
    },
  },

  categories: {
    list: (): Promise<CategoryDto[]> =>
      pick(
        () => fx.CATEGORIES,
        () => http.get<CategoryDto[]>('/categories'),
      ),
  },

  texts: {
    list: (params: { category?: string; level?: string } = {}): Promise<TextDto[]> =>
      pick(
        () => fx.TEXTS,
        () => http.get<TextDto[]>('/texts', { params }),
      ),
  },

  dictionary: {
    list: (params: { topic?: string; q?: string } = {}): Promise<DictEntryDto[]> =>
      pick(
        () => fx.DICTIONARY,
        () => http.get<DictEntryDto[]>('/words', { params }),
      ),
  },

  sessions: {
    /** The keystroke array travels with the run so the server can re-verify the score. */
    submit: (body: SessionSubmitDto): Promise<SessionResultDto> =>
      pick(
        () => ({ id: Date.now(), isPersonalBest: false }),
        () => http.post<SessionResultDto>('/sessions', body),
      ),
  },

  stats: {
    summary: (): Promise<StatsSummaryDto> =>
      pick(
        () => fx.SUMMARY,
        () => http.get<StatsSummaryDto>('/stats/summary'),
      ),
    trend: (lang: 'en' | 'zh', days = 30): Promise<TrendPointDto[]> =>
      pick(
        () => (lang === 'zh' ? fx.TREND_ZH : fx.TREND_EN),
        () => http.get<TrendPointDto[]>('/stats/trend', { params: { lang, days } }),
      ),
    history: (): Promise<HistoryItemDto[]> =>
      pick(
        () => fx.HISTORY,
        () => http.get<HistoryItemDto[]>('/sessions/me'),
      ),
    keyErrors: (): Promise<KeyErrorRateDto[]> =>
      pick(
        () => fx.KEY_ERRORS,
        () => http.get<KeyErrorRateDto[]>('/stats/keys'),
      ),
  },

  leaderboard: {
    board: (lang: 'en' | 'zh', period: 'weekly' | 'monthly'): Promise<LeaderboardRowDto[]> =>
      pick(
        () => (lang === 'zh' ? fx.LEADERBOARD_ZH : fx.LEADERBOARD_EN),
        () => http.get<LeaderboardRowDto[]>('/leaderboard', { params: { lang, period } }),
      ),
    compare: (period: 'weekly' | 'monthly'): Promise<CompareRowDto[]> =>
      pick(
        () => fx.compareRows(period),
        () => http.get<CompareRowDto[]>('/stats/compare', { params: { period } }),
      ),
    personalBests: (): Promise<PersonalBestDto[]> =>
      pick(
        () => fx.PERSONAL_BESTS,
        () => http.get<PersonalBestDto[]>('/stats/bests'),
      ),
  },

  coach: {
    get: (): Promise<CoachDto> =>
      pick(
        () => fx.COACH,
        () => http.get<CoachDto>('/coach'),
      ),
    book: (): Promise<BookEntryDto[]> =>
      pick(
        () => fx.BOOK,
        () => http.get<BookEntryDto[]>('/book'),
      ),
    saveBook: (book: BookEntryDto[]): Promise<void> =>
      pick(
        () => undefined,
        () => http.put<void>('/book', book),
      ),
  },
}

export * from './types'
export { ApiError, USE_MOCK } from './http'
