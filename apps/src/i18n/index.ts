import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'

export const LOCALES = ['en', 'zh-TW', 'zh-CN'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
}

const STORAGE_KEY = 'typelab.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    /* private windows have no storage; fall through to the default */
  }
  return 'en'
}

/**
 * `en` is the source of truth: the other files are derived from it and fall
 * back to it key by key, so a missing translation shows English, not a key.
 */
export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, 'zh-TW': zhTW, 'zh-CN': zhCN },
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export const currentLocale = () => i18n.global.locale.value as Locale
