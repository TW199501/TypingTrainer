export type LayoutKind = 'en' | 'zh' | 'zhuyin'

/** Matches a key in TEXTS; `custom` is the fallback bucket for user-pasted content. */
export type CategoryKind =
  'basic' | 'english' | 'chinese' | 'zhuyin' | 'bilingual' | 'code' | 'timed' | 'custom'

export interface SubCategory {
  id: string
  name: string
  count: number
}

export interface Category {
  id: string
  name: string
  color: string
  layout: LayoutKind
  kind: CategoryKind
  children: SubCategory[]
}

export interface TextItem {
  title: string
  category: string
  sub: string
  level: string
  chars: number
  best: number | string
  last: string
}

export interface DictEntry {
  w: string
  ph: string
  pos: string
  zh: string
  cat: string
  ex: string
  mastery: number
}

/** One key in the error book, scheduled with the SRS_DAYS ladder. */
export interface BookEntry {
  ch: string
  total: number
  box: number
  dueIn: number
}

export interface LocalModel {
  /** Stable id used by the install/remove calls and as the on-disk folder name. */
  code: string
  name: string
  kind: 'Token' | 'Embed' | 'Rerank'
  note: string
  mb: number
  installed: boolean
}

export interface PromptPreset {
  /** Set on catalogue rows; absent on a prompt the user just added. */
  code?: string
  name: string
  text: string
}

export interface AnalysisResult {
  title: string
  category: string
  sub: string
  level: string
  chars: number
  reason: string
}

export interface ImportFile {
  name: string
  ext: string
  size: string
  text: string
  note: string
}
