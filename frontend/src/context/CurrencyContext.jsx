import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

export const CURRENCIES = [
  { code: 'AED', symbol: 'AED',  name: 'UAE Dirham',          flag: '🇦🇪', locale: 'en-AE' },
  { code: 'GBP', symbol: '£',    name: 'British Pound',        flag: '🇬🇧', locale: 'en-GB' },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',         flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',         flag: '🇹🇷', locale: 'tr-TR' },
  { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit',    flag: '🇲🇾', locale: 'ms-MY' },
  { code: 'VND', symbol: '₫',    name: 'Vietnamese Dong',      flag: '🇻🇳', locale: 'vi-VN' },
  { code: 'IDR', symbol: 'Rp',   name: 'Indonesian Rupiah',    flag: '🇮🇩', locale: 'id-ID' },
  { code: 'THB', symbol: '฿',    name: 'Thai Baht',            flag: '🇹🇭', locale: 'th-TH' },
  { code: 'PHP', symbol: '₱',    name: 'Philippine Peso',      flag: '🇵🇭', locale: 'fil-PH' },
]

// Fallback rates vs AED (approximate, used if API fails)
const FALLBACK_RATES = {
  AED: 1,
  GBP: 0.2128,
  CNY: 2.6789,
  TRY: 14.1232,
  MYR: 1.6304,
  VND: 939.42,
  IDR: 5851.25,
  THB: 13.0867,
  PHP: 20.7854,
}

const CACHE_KEY = 'qc_fx_rates'
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

function loadCachedRates() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, rates } = JSON.parse(raw)
    if (Date.now() - ts < CACHE_TTL) return rates
  } catch {}
  return null
}

function saveRatesToCache(rates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }))
  } catch {}
}

const CurrencyContext = createContext()

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => localStorage.getItem('qc_currency') || 'AED')
  const [rates, setRates] = useState(loadCachedRates() || FALLBACK_RATES)
  const [rateDate, setRateDate] = useState(null)
  const [rateLoading, setRateLoading] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    const cached = loadCachedRates()
    if (cached) { setRates(cached); return }
    if (fetchedRef.current) return
    fetchedRef.current = true
    setRateLoading(true)
    // open.er-api.com — free, no API key, base AED
    fetch('https://open.er-api.com/v6/latest/AED')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) {
          const r = {}
          CURRENCIES.forEach(c => { if (data.rates[c.code]) r[c.code] = data.rates[c.code] })
          r.AED = 1
          setRates(r)
          setRateDate(data.time_last_update_utc || null)
          saveRatesToCache(r)
        }
      })
      .catch(() => {}) // use fallback silently
      .finally(() => setRateLoading(false))
  }, [])

  const setCurrency = useCallback((code) => {
    setCurrencyState(code)
    localStorage.setItem('qc_currency', code)
  }, [])

  // Convert an AED amount to the selected currency
  const convert = useCallback((aedAmount) => {
    if (!aedAmount && aedAmount !== 0) return null
    const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
    return Number(aedAmount) * rate
  }, [rates, currency])

  // Format an AED amount in the selected currency
  const formatAmount = useCallback((aedAmount, opts = {}) => {
    if (aedAmount === null || aedAmount === undefined) return '—'
    const cur = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]
    const converted = convert(aedAmount)
    if (converted === null) return '—'
    // For VND and IDR, no decimals (very small units)
    const noDecimals = ['VND', 'IDR'].includes(currency)
    const formatted = Math.abs(converted) >= 1000
      ? converted.toLocaleString('en-US', { minimumFractionDigits: noDecimals ? 0 : 2, maximumFractionDigits: noDecimals ? 0 : 2 })
      : converted.toFixed(noDecimals ? 0 : 2)
    return `${cur.symbol} ${formatted}`
  }, [currency, convert])

  const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, rateDate, rateLoading, convert, formatAmount, currentCurrency, CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)
