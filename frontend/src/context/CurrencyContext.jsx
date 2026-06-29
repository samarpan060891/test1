import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

// USD first (primary), AED second (local), then alphabetical
export const CURRENCIES = [
  { code: 'USD', symbol: '$',    name: 'US Dollar',            flag: '🇺🇸', locale: 'en-US' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham',            flag: '🇦🇪', locale: 'en-AE', local: true },
  { code: 'EUR', symbol: '€',   name: 'Euro',                  flag: '🇪🇺', locale: 'de-DE' },
  { code: 'GBP', symbol: '£',   name: 'British Pound',         flag: '🇬🇧', locale: 'en-GB' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',          flag: '🇮🇳', locale: 'en-IN' },
  { code: 'CNY', symbol: '¥',   name: 'Chinese Yuan',          flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'TRY', symbol: '₺',   name: 'Turkish Lira',          flag: '🇹🇷', locale: 'tr-TR' },
  { code: 'MYR', symbol: 'RM',  name: 'Malaysian Ringgit',     flag: '🇲🇾', locale: 'ms-MY' },
  { code: 'VND', symbol: '₫',   name: 'Vietnamese Dong',       flag: '🇻🇳', locale: 'vi-VN' },
  { code: 'IDR', symbol: 'Rp',  name: 'Indonesian Rupiah',     flag: '🇮🇩', locale: 'id-ID' },
  { code: 'THB', symbol: '฿',   name: 'Thai Baht',             flag: '🇹🇭', locale: 'th-TH' },
  { code: 'PHP', symbol: '₱',   name: 'Philippine Peso',       flag: '🇵🇭', locale: 'fil-PH' },
]

// Fallback rates per 1 AED (approximate, used if API unavailable)
const FALLBACK_RATES = {
  AED: 1,
  USD: 0.2723,
  EUR: 0.2503,
  GBP: 0.2128,
  INR: 22.68,
  CNY: 1.9812,
  TRY: 10.423,
  MYR: 1.2304,
  VND: 6939.42,
  IDR: 4451.25,
  THB: 9.8867,
  PHP: 15.7854,
}

const CACHE_KEY = 'qc_fx_rates_v2'
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
  const [currency, setCurrencyState] = useState(() => localStorage.getItem('qc_currency') || 'USD')
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
    fetch('https://open.er-api.com/v6/latest/AED')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) {
          const r = { AED: 1 }
          CURRENCIES.forEach(c => { if (data.rates[c.code]) r[c.code] = data.rates[c.code] })
          setRates(r)
          setRateDate(data.time_last_update_utc || null)
          saveRatesToCache(r)
        }
      })
      .catch(() => {})
      .finally(() => setRateLoading(false))
  }, [])

  const setCurrency = useCallback((code) => {
    setCurrencyState(code)
    localStorage.setItem('qc_currency', code)
  }, [])

  // Convert amount from one currency to another (via AED as pivot)
  const convertFromTo = useCallback((amount, fromCode, toCode) => {
    if (amount === null || amount === undefined || amount === '') return null
    const fromRate = rates[fromCode] ?? FALLBACK_RATES[fromCode] ?? 1
    const toRate   = rates[toCode]   ?? FALLBACK_RATES[toCode]   ?? 1
    const aed = Number(amount) / fromRate   // to AED
    return aed * toRate                      // to target
  }, [rates])

  // Convert an AED amount to the display currency
  const convert = useCallback((aedAmount) => {
    return convertFromTo(aedAmount, 'AED', currency)
  }, [convertFromTo, currency])

  // Format helper — avoids decimals for VND/IDR
  const _fmt = (amount, code) => {
    const cur = CURRENCIES.find(c => c.code === code) || CURRENCIES[0]
    const noDecimals = ['VND', 'IDR'].includes(code)
    const abs = Math.abs(amount)
    const str = abs >= 1000
      ? amount.toLocaleString('en-US', { minimumFractionDigits: noDecimals ? 0 : 2, maximumFractionDigits: noDecimals ? 0 : 2 })
      : amount.toFixed(noDecimals ? 0 : 2)
    return `${cur.symbol} ${str}`
  }

  // Format an AED-stored amount in the selected display currency
  const formatAmount = useCallback((aedAmount) => {
    if (aedAmount === null || aedAmount === undefined) return '—'
    const converted = convert(Number(aedAmount))
    if (converted === null) return '—'
    return _fmt(converted, currency)
  }, [currency, convert])

  // Format a value that is stored in a specific currency (e.g. 'USD'), displayed in the selected currency
  const formatFrom = useCallback((amount, fromCode) => {
    if (amount === null || amount === undefined || amount === '') return '—'
    const converted = convertFromTo(Number(amount), fromCode || currency, currency)
    if (converted === null) return '—'
    return _fmt(converted, currency)
  }, [currency, convertFromTo])

  // Raw conversion: fromCode → display currency, no formatting
  const convertForDisplay = useCallback((amount, fromCode) => {
    return convertFromTo(amount, fromCode || currency, currency)
  }, [currency, convertFromTo])

  const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]

  return (
    <CurrencyContext.Provider value={{
      currency, setCurrency, rates, rateDate, rateLoading,
      convert, convertFromTo, convertForDisplay,
      formatAmount, formatFrom, currentCurrency, CURRENCIES,
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)
