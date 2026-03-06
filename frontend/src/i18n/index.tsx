import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import zh from './locales/zh'
import en from './locales/en'
import type { Translations } from './locales/zh'

export type Locale = 'zh' | 'en'

const locales: Record<Locale, Translations> = { zh, en }

interface I18nContextType {
  locale: Locale
  t: Translations
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = 'agenteval-locale'

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {}
  // Auto-detect from browser
  const lang = navigator.language?.toLowerCase() || ''
  return lang.startsWith('zh') ? 'zh' : 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
  }, [])

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'zh' ? 'en' : 'zh')
  }, [locale, setLocale])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, t: locales[locale], setLocale, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function useTranslation() {
  const { t } = useI18n()
  return t
}
