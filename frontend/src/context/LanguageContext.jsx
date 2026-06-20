import React, { createContext, useContext, useState, useCallback } from 'react'
import translations, { COUNTRY_LANGUAGE_MAP } from '../i18n/translations.js'
import client from '../api/client.js'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('qc_lang') || 'en')

  const setLanguage = useCallback((code) => {
    setLangState(code)
    localStorage.setItem('qc_lang', code)
    client.put('/auth/language', { language: code }).catch(() => {})
  }, [])

  const autoDetectLanguage = useCallback((country) => {
    const detected = COUNTRY_LANGUAGE_MAP[country]
    if (detected && !localStorage.getItem('qc_lang')) {
      setLangState(detected)
      localStorage.setItem('qc_lang', detected)
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
