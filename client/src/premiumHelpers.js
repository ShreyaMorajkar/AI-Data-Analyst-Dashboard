export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
export const BOARD_STORAGE_KEY = 'ai-analyst-board-snapshots-v1'
export const CHART_COLORS = ['#c9a84c', '#94a3b8', '#e2e8f0', '#22d3ee', '#f472b6', '#818cf8']

export function numberFormatter(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value
  }

  if (Math.abs(value) >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M'
  }
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(1) + 'K'
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 1,
  }).format(value)
}

export function axisDateFormatter(value) {
  if (!value || typeof value !== 'string') return value
  // Simple check for ISO date pattern
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return value
      // If it's a month bucket (often first-of-month at midnight), keep it compact.
      if (d.getUTCDate() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
        return d.toLocaleDateString('en-GB', { month: 'short' })
      }
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    } catch {
      return value
    }
  }
  return value
}

export function labelFormatter(value) {
  const str = String(value ?? '')
  if (str.length > 14) {
    return str.substring(0, 12) + '...'
  }
  return str
}

export function humanizeValue(value) {
  if (typeof value === 'number') {
    return numberFormatter(value)
  }

  return String(value ?? '')
}

export function formatRelativeDate(value) {
  if (!value) {
    return 'No recent activity'
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function chartTypeLabel(type) {
  if (type === 'line') {
    return 'Trend'
  }

  if (type === 'pie') {
    return 'Mix'
  }

  if (type === 'bar') {
    return 'Ranking'
  }

  return 'Insight'
}

export function buildPromptFromColumns(profile) {
  const metric = profile?.numericColumns?.[0]?.label?.toLowerCase() ?? 'records'
  const dimension = profile?.categoricalColumns?.[0]?.label?.toLowerCase() ?? 'product'
  const date = profile?.dateColumns?.[0]?.label?.toLowerCase() ?? 'date'
  const countPrompt = profile?.numericColumns?.length
    ? `Which ${dimension} has the highest ${metric}?`
    : `Which ${dimension} has the highest count?`
  const distributionPrompt = profile?.numericColumns?.length
    ? `Show ${metric} distribution by ${dimension}`
    : `Show ${dimension} distribution by count`

  return [
    `Show ${metric} trend by ${date}`,
    `Top 5 ${dimension} by ${metric}`,
    distributionPrompt,
    countPrompt,
    `Average ${metric}`,
  ]
}

export function makeQuickViewDefinitions(profile) {
  const metric = profile?.numericColumns?.[0]?.label?.toLowerCase() ?? 'sales'
  const dimension = profile?.categoricalColumns?.[0]?.label?.toLowerCase() ?? 'category'
  const date = profile?.dateColumns?.[0]?.label?.toLowerCase() ?? 'date'

  return [
    {
      id: 'trend',
      title: 'Trend View',
      subtitle: `Movement in ${metric} across ${date}`,
      prompt: `Show ${metric} trend by ${date}`,
      accent: 'bg-cyan-400',
    },
    {
      id: 'ranking',
      title: 'Ranking View',
      subtitle: `Top ${dimension} by ${metric}`,
      prompt: `Top 5 ${dimension} by ${metric}`,
      accent: 'bg-violet-400',
    },
    {
      id: 'mix',
      title: 'Mix View',
      subtitle: `${metric} split by ${dimension}`,
      prompt: `Show ${metric} distribution by ${dimension}`,
      accent: 'bg-emerald-400',
    },
  ]
}

export async function fetchJson(url, options) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
  const headers = new Headers(options?.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  const payload = await response.json()

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('auth_token')
    }
    throw new Error(payload.error || payload.details || 'Request failed.')
  }

  return payload
}

export function readSavedBoards() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function writeSavedBoards(boards) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(boards))
}
