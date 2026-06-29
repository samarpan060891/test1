import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import translations, { COUNTRY_LANGUAGE_MAP } from '../i18n/translations.js'
import client from '../api/client.js'

// BCP-47 locale codes for browser native translation
const LANG_TO_LOCALE = {
  en: 'en', zh: 'zh', tr: 'tr', ms: 'ms',
  vi: 'vi', id: 'id', th: 'th', fil: 'fil'
}

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('qc_lang') || 'en')

  // Keep <html lang> in sync so browsers offer native translation for DB content
  useEffect(() => {
    document.documentElement.lang = LANG_TO_LOCALE[lang] || lang
  }, [lang])

  const setLanguage = useCallback((code) => {
    setLangState(code)
    localStorage.setItem('qc_lang', code)
    document.documentElement.lang = LANG_TO_LOCALE[code] || code
    client.put('/auth/language', { language: code }).catch(() => {})
  }, [])

  const autoDetectLanguage = useCallback((country) => {
    const detected = COUNTRY_LANGUAGE_MAP[country]
    if (detected && !localStorage.getItem('qc_lang')) {
      setLangState(detected)
      localStorage.setItem('qc_lang', detected)
      document.documentElement.lang = LANG_TO_LOCALE[detected] || detected
    }
  }, [])

  const t = useCallback((key) => {
    const keys = key.split('.')
    let val = translations[lang]
    for (const k of keys) val = val?.[k]
    if (val !== undefined) return val
    val = translations['en']
    for (const k of keys) val = val?.[k]
    return val !== undefined ? val : key
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, autoDetectLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
