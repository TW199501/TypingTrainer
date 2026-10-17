import { desktopModelDir, IS_DESKTOP } from './desktop'
import { delay, http, USE_MOCK, writeToken } from './http'
import * as fx from './mock/fixtures'
import * as lib from './mock/library'
import { fetchAllPages } from './paging'
import type {
  AuthUserDto,
  BookEntryDto,
  CategoryDto,
  CoachDto,
  CreateCategoryBody,
  CreateTextBody,
  CompareRowDto,
  DictEntryDto,
  HistoryItemDto,
  ImportPreviewDto,
  ImportWordsBody,
  ImportWordsResult,
  KeyErrorRateDto,
  LeaderboardRowDto,
  LoginRequest,
  ModelStorageDto,
  PersonalBestDto,
  PromptDto,
  SessionResultDto,
  SessionSubmitDto,
  StatsSummaryDto,
  TextDto,
  TrendPointDto,
  WordImportMap,
} from './types'

/** A preview uploads the whole file too, so it gets far longer than the default 15 seconds. */
const UPLOAD_TIMEOUT_MS = 5 * 60_000

export type ApiGroup =
  | 'auth'
  | 'categories'
  | 'texts'
  | 'dictionary'
  | 'sessions'
  | 'stats'
  | 'leaderboard'
  | 'models'
  | 'prompts'
  | 'coach'

/** Groups the bundled API answers on desktop even though the build flag says mock. */
export const DESKTOP_REAL_GROUPS: ReadonlySet<ApiGroup> = new Set<ApiGroup>([
  'categories',
  'texts',
  'dictionary',
])

/** Desktop follows `DESKTOP_REAL_GROUPS`; the web build follows `VITE_USE_MOCK`. */
export function usesRealApi(group: ApiGroup, desktop = IS_DESKTOP, mock = USE_MOCK): boolean {
  return desktop ? DESKTOP_REAL_GROUPS.has(group) : !mock
}

/** Per call, decides whether the fixture or the endpoint answers; `mockDelayMs` overrides the mock's pause. */
async function pick<T>(
  group: ApiGroup,
  mock: () => T,
  real: () => Promise<{ data: T }>,
  mockDelayMs?: number,
): Promise<T> {
  if (!usesRealApi(group)) return delay(mock(), mockDelayMs)
  const res = await real()
  return res.data
}

export const api = {
  auth: {
    async login(body: LoginRequest): Promise<AuthUserDto> {
      const user = await pick(
        'auth',
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
        'categories',
        () => lib.listCategories(),
        () => http.get<CategoryDto[]>('/categories'),
      ),
    create: (body: CreateCategoryBody): Promise<{ id: string }> =>
      pick(
        'categories',
        () => lib.createCategory(body),
        () => http.post<{ id: string }>('/categories', body),
      ),
    rename: (id: string, name: string): Promise<void> =>
      pick(
        'categories',
        () => lib.renameCategory(id, name),
        () => http.put<void>(`/categories/${id}`, { name }),
      ),
    remove: (id: string): Promise<void> =>
      pick(
        'categories',
        () => lib.removeCategory(id),
        () => http.delete<void>(`/categories/${id}`),
      ),
  },

  texts: {
    /** Walks every page, so the caller always gets the full list. */
    list: (params: { category?: string; sub?: string } = {}): Promise<TextDto[]> =>
      pick(
        'texts',
        () => lib.listTexts(params),
        async () => ({ data: await fetchAllPages<TextDto>('/texts', params) }),
        0,
      ),
    get: (id: number): Promise<TextDto> =>
      pick(
        'texts',
        () => lib.getText(id),
        () => http.get<TextDto>(`/texts/${id}`),
        0,
      ),
    create: (body: CreateTextBody): Promise<TextDto> =>
      pick(
        'texts',
        () => lib.createText(body),
        () => http.post<TextDto>('/texts', body),
      ),
    import: (texts: CreateTextBody[]): Promise<TextDto[]> =>
      pick(
        'texts',
        () => texts.map((t) => lib.createText(t)),
        () => http.post<TextDto[]>('/texts/import', { texts }),
      ),
    remove: (id: number): Promise<void> =>
      pick(
        'texts',
        () => lib.removeText(id),
        () => http.delete<void>(`/texts/${id}`),
      ),
  },

  dictionary: {
    /** Walks every page, so the caller always gets the full list. */
    list: (params: { topic?: string; q?: string } = {}): Promise<DictEntryDto[]> =>
      pick(
        'dictionary',
        () => fx.DICTIONARY,
        async () => ({ data: await fetchAllPages<DictEntryDto>('/words', params) }),
      ),
    /** Web mock only: rows the browser parsed itself. The API reads the file, see `importFile`. */
    import: (body: ImportWordsBody): Promise<ImportWordsResult> =>
      delay({ added: body.words.length, skipped: 0 }),
    /** API only: uploads the file and returns its headers and first rows, read on the server. */
    async preview(file: File): Promise<ImportPreviewDto> {
      const form = new FormData()
      form.append('file', file)
      const res = await http.post<ImportPreviewDto>('/words/import/preview', form, {
        timeout: UPLOAD_TIMEOUT_MS,
      })
      return res.data
    },
    /**
     * API only: uploads the file with the column map. No timeout: a file of hundreds of
     * thousands of rows takes a while, and `onProgress` (0–1) reports the upload.
     */
    async importFile(
      file: File,
      map: WordImportMap,
      skipDuplicates: boolean,
      onProgress?: (fraction: number) => void,
    ): Promise<ImportWordsResult> {
      const form = new FormData()
      form.append('file', file)
      form.append('map', JSON.stringify(map))
      form.append('skipDuplicates', String(skipDuplicates))
      const res = await http.post<ImportWordsResult>('/words/import/file', form, {
        timeout: 0,
        onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : (e.progress ?? 0)),
      })
      return res.data
    },
  },

  sessions: {
    /** The keystroke array travels with the run so the server can re-verify the score. */
    submit: (body: SessionSubmitDto): Promise<SessionResultDto> =>
      pick(
        'sessions',
        () => ({ id: Date.now(), isPersonalBest: false }),
        () => http.post<SessionResultDto>('/sessions', body),
      ),
  },

  stats: {
    summary: (): Promise<StatsSummaryDto> =>
      pick(
        'stats',
        () => fx.SUMMARY,
        () => http.get<StatsSummaryDto>('/stats/summary'),
      ),
    trend: (lang: 'en' | 'zh', days = 30): Promise<TrendPointDto[]> =>
      pick(
        'stats',
        () => (lang === 'zh' ? fx.TREND_ZH : fx.TREND_EN),
        () => http.get<TrendPointDto[]>('/stats/trend', { params: { lang, days } }),
      ),
    history: (): Promise<HistoryItemDto[]> =>
      pick(
        'stats',
        () => fx.HISTORY,
        () => http.get<HistoryItemDto[]>('/sessions/me'),
      ),
    keyErrors: (): Promise<KeyErrorRateDto[]> =>
      pick(
        'stats',
        () => fx.KEY_ERRORS,
        () => http.get<KeyErrorRateDto[]>('/stats/keys'),
      ),
  },

  leaderboard: {
    board: (lang: 'en' | 'zh', period: 'weekly' | 'monthly'): Promise<LeaderboardRowDto[]> =>
      pick(
        'leaderboard',
        () => (lang === 'zh' ? fx.LEADERBOARD_ZH : fx.LEADERBOARD_EN),
        () => http.get<LeaderboardRowDto[]>('/leaderboard', { params: { lang, period } }),
      ),
    compare: (period: 'weekly' | 'monthly'): Promise<CompareRowDto[]> =>
      pick(
        'leaderboard',
        () => fx.compareRows(period),
        () => http.get<CompareRowDto[]>('/stats/compare', { params: { period } }),
      ),
    personalBests: (): Promise<PersonalBestDto[]> =>
      pick(
        'leaderboard',
        () => fx.PERSONAL_BESTS,
        () => http.get<PersonalBestDto[]>('/stats/bests'),
      ),
  },

  models: {
    /**
     * The catalogue plus the directory it installs into. The path comes from
     * whoever owns the disk: the Tauri shell on desktop, the server in a
     * browser — the front end never assumes one.
     */
    async storage(locale?: string): Promise<ModelStorageDto> {
      const dto = await pick(
        'models',
        () => fx.modelStorage(locale),
        () => http.get<ModelStorageDto>('/models', { params: { locale } }),
      )
      const local = await desktopModelDir()
      return local ? { ...dto, directory: local, writable: true } : dto
    },
    install: (code: string): Promise<void> =>
      pick(
        'models',
        () => undefined,
        () => http.post<void>(`/models/${code}/install`),
      ),
    remove: (code: string): Promise<void> =>
      pick(
        'models',
        () => undefined,
        () => http.delete<void>(`/models/${code}/install`),
      ),
  },

  prompts: {
    list: (locale?: string): Promise<PromptDto[]> =>
      pick(
        'prompts',
        () => fx.prompts(locale),
        () => http.get<PromptDto[]>('/prompts', { params: { locale } }),
      ),
  },

  coach: {
    get: (): Promise<CoachDto> =>
      pick(
        'coach',
        () => fx.COACH,
        () => http.get<CoachDto>('/coach'),
      ),
    book: (): Promise<BookEntryDto[]> =>
      pick(
        'coach',
        () => fx.BOOK,
        () => http.get<BookEntryDto[]>('/book'),
      ),
    saveBook: (book: BookEntryDto[]): Promise<void> =>
      pick(
        'coach',
        () => undefined,
        () => http.put<void>('/book', book),
      ),
  },
}

export * from './types'
export { ApiError, USE_MOCK } from './http'
