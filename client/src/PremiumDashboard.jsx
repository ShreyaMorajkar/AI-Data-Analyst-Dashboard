import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import {
  API_BASE,
  buildPromptFromColumns,
  chartTypeLabel,
  fetchJson,
  formatRelativeDate,
  makeQuickViewDefinitions,
  numberFormatter,
  readSavedBoards,
  writeSavedBoards,
} from './premiumHelpers'
import {
  FocusItem,
  InsightChart,
  MessageBubble,
  MetricCard,
  SessionButton,
  StatusChip,
  Surface,
  ViewCard,
} from './premiumComponents'

const PRESETS = [
  {
    id: 'overview',
    label: 'Overview',
    caption: 'Default',
    description: 'Balanced view across movement, ranking, and mix.',
    order: ['analysis', 'trend', 'ranking', 'mix'],
  },
  {
    id: 'performance',
    label: 'Performance',
    caption: 'Ranking',
    description: 'Lead with strongest performers and supporting trend.',
    order: ['ranking', 'analysis', 'trend', 'mix'],
  },
  {
    id: 'mix',
    label: 'Distribution',
    caption: 'Composition',
    description: 'Lead with contribution and category share.',
    order: ['mix', 'analysis', 'trend', 'ranking'],
  },
  {
    id: 'explorer',
    label: 'Latest',
    caption: 'Focused',
    description: 'Keep the latest answer in the primary position.',
    order: ['analysis', 'mix', 'ranking', 'trend'],
  },
]

const QUESTION_LIMIT = 500

export default function PremiumDashboard() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [question, setQuestion] = useState('')
  const [session, setSession] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [quickViews, setQuickViews] = useState([])
  const [dashboardMode, setDashboardMode] = useState('overview')
  const [focusedViewId, setFocusedViewId] = useState(null)
  const [history, setHistory] = useState([])
  const [recentSessions, setRecentSessions] = useState([])
  const [savedBoards, setSavedBoards] = useState(() => readSavedBoards())
  const [systemHealth, setSystemHealth] = useState({ ok: false, database: false })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const deferredQuestion = useDeferredValue(question)
  const promptSuggestions = useMemo(
    () => analysis?.suggestionChips ?? buildPromptFromColumns(session?.profile),
    [analysis, session],
  )

  async function refreshRecentSessions() {
    try {
      const payload = await fetchJson(`${API_BASE}/api/sessions/recent`)
      setRecentSessions(payload.sessions ?? [])
    } catch {
      setRecentSessions([])
    }
  }

  async function refreshBoards() {
    try {
      const payload = await fetchJson(`${API_BASE}/api/boards`)
      if (payload.boards?.length) {
        setSavedBoards(payload.boards)
        return
      }
    } catch {
      // fall back to local saved boards
    }

    setSavedBoards(readSavedBoards())
  }

  async function loadQuickViews(sessionId, profile) {
    const definitions = makeQuickViewDefinitions(profile)
    const results = await Promise.all(
      definitions.map(async (item) => {
        try {
          const payload = await fetchJson(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, question: item.prompt }),
          })

          return {
            ...item,
            title: payload.analysis?.title || item.title,
            subtitle: payload.analysis?.summary || item.subtitle,
            chart: payload.analysis?.chart ?? null,
          }
        } catch {
          return { ...item, chart: null }
        }
      }),
    )

    const fallbackViews = definitions.map((item, index) => ({
      ...item,
      chart:
        results[index]?.chart ??
        {
          type: index === 0 ? 'line' : index === 1 ? 'bar' : 'pie',
          xKey: 'label',
          yKey: 'value',
          data: [],
        },
    }))

    setQuickViews(fallbackViews)
  }

  async function runViewPrompt(view) {
    if (!session?.sessionId || !view?.prompt) {
      return
    }

    try {
      setStatus('analyzing')
      setError('')

      const payload = await fetchJson(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, question: view.prompt }),
      })

      startTransition(() => {
        setAnalysis(payload.analysis)
        setQuickViews((current) =>
          current.map((item) =>
            item.id === view.id
              ? {
                  ...item,
                  title: payload.analysis?.title || item.title,
                  subtitle: payload.analysis?.summary || item.subtitle,
                  chart: payload.analysis?.chart ?? item.chart,
                }
              : item,
          ),
        )
        setHistory((current) => [
          ...current,
          { role: 'user', content: view.prompt, meta: `Run ${view.title}` },
          { role: 'assistant', content: payload.analysis.summary || payload.analysis.title, meta: 'View updated' },
        ])
      })

      setFocusedViewId(view.id)
      setStatus('ready')
      refreshRecentSessions()
    } catch (analysisError) {
      setError(analysisError.message)
      setStatus('ready')
    }
  }

  async function restoreSession(sessionId, options = {}) {
    try {
      setError('')
      const [sessionPayload, historyPayload] = await Promise.all([
        fetchJson(`${API_BASE}/api/session/${sessionId}`),
        fetchJson(`${API_BASE}/api/session/${sessionId}/history`),
      ])

      startTransition(() => {
        setSession({
          sessionId: sessionPayload.sessionId,
          filename: sessionPayload.filename,
          profile: sessionPayload.profile,
        })
        setAnalysis(
          sessionPayload.latestAnalysis ?? {
            title: 'Dataset overview',
            summary: `Reloaded ${sessionPayload.filename}.`,
            insights: ['This board has been restored so you can continue from the same dataset.'],
            chart: null,
            table: sessionPayload.profile?.previewRows ?? [],
            suggestionChips: buildPromptFromColumns(sessionPayload.profile),
          },
        )
        setHistory(
          (historyPayload.messages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
            meta: message.role === 'assistant' ? 'History replay' : 'Saved prompt',
          })),
        )
      })

      setDashboardMode(options.mode ?? 'overview')
      setFocusedViewId(options.focusedViewId ?? null)
      loadQuickViews(sessionPayload.sessionId, sessionPayload.profile)
    } catch (restoreError) {
      setError(restoreError.message)
    }
  }

  useEffect(() => {
    async function loadShell() {
      try {
        const [healthPayload, recentPayload, boardsPayload] = await Promise.all([
          fetchJson(`${API_BASE}/api/health`),
          fetchJson(`${API_BASE}/api/sessions/recent`).catch(() => ({ sessions: [] })),
          fetchJson(`${API_BASE}/api/boards`).catch(() => ({ boards: [] })),
        ])
        setSystemHealth(healthPayload)
        setRecentSessions(recentPayload.sessions ?? [])
        if (boardsPayload.boards?.length) {
          setSavedBoards(boardsPayload.boards)
        }
      } catch {
        setSystemHealth({ ok: false, database: false })
      }
    }

    loadShell()
  }, [])

  useEffect(() => {
    async function restoreSharedBoard() {
      if (typeof window === 'undefined') {
        return
      }

      const boardId = new URLSearchParams(window.location.search).get('board')
      if (!boardId) {
        return
      }

      try {
        const snapshot = await fetchJson(`${API_BASE}/api/boards/${boardId}`)
        const [sessionPayload, historyPayload] = await Promise.all([
          fetchJson(`${API_BASE}/api/session/${snapshot.sessionId}`),
          fetchJson(`${API_BASE}/api/session/${snapshot.sessionId}/history`),
        ])

        startTransition(() => {
          setSession({
            sessionId: sessionPayload.sessionId,
            filename: sessionPayload.filename,
            profile: sessionPayload.profile,
          })
          setAnalysis(
            sessionPayload.latestAnalysis ?? {
              title: 'Dataset overview',
              summary: `Reloaded ${sessionPayload.filename}.`,
              insights: ['This board has been restored so you can continue from the same dataset.'],
              chart: null,
              table: sessionPayload.profile?.previewRows ?? [],
              suggestionChips: buildPromptFromColumns(sessionPayload.profile),
            },
          )
          setHistory(
            (historyPayload.messages ?? []).map((message) => ({
              role: message.role,
              content: message.content,
              meta: message.role === 'assistant' ? 'History replay' : 'Saved prompt',
            })),
          )
        })

        setDashboardMode(snapshot.mode ?? 'overview')
        setFocusedViewId(snapshot.focusedViewId ?? null)
        loadQuickViews(sessionPayload.sessionId, sessionPayload.profile)
        setNotice(`Loaded shared board: ${snapshot.title}`)
      } catch (sharedBoardError) {
        setError(sharedBoardError.message)
      }
    }

    restoreSharedBoard()
  }, [])

  useEffect(() => {
    if (!session?.sessionId) {
      return
    }

    async function loadHistory() {
      try {
        const payload = await fetchJson(`${API_BASE}/api/session/${session.sessionId}/history`)
        if (payload.messages?.length) {
          setHistory(
            payload.messages.map((message) => ({
              role: message.role,
              content: message.content,
              meta: message.role === 'assistant' ? 'Saved insight' : 'Saved question',
            })),
          )
        }
      } catch {
        // Local mode sessions may not have persisted history.
      }
    }

    loadHistory()
  }, [session?.sessionId])

  async function uploadFile(event) {
    event.preventDefault()
    if (!selectedFile) {
      setError('Choose a CSV file first.')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      setStatus('uploading')
      setError('')
      const payload = await fetchJson(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
      const intro = `Dataset ${payload.filename} uploaded. I found ${payload.profile.rowCount} rows and ${payload.profile.columns.length} columns. Ask about trends, leaders, averages, or distribution.`

      startTransition(() => {
        setSession({
          sessionId: payload.sessionId,
          filename: payload.filename,
          profile: payload.profile,
        })
        setAnalysis(payload.initialAnalysis)
        setHistory([{ role: 'assistant', content: intro, meta: 'Board ready' }])
      })

      setQuestion('')
      setSelectedFile(null)
      setStatus('ready')
      setDashboardMode('overview')
      setFocusedViewId(null)
      refreshRecentSessions()
      loadQuickViews(payload.sessionId, payload.profile)
    } catch (uploadError) {
      setError(uploadError.message)
      setStatus('idle')
    }
  }

  async function askQuestion(event, overrideQuestion) {
    event?.preventDefault()
    const activeQuestion = (overrideQuestion ?? question).trim()

    if (!session?.sessionId) {
      setError('Upload a CSV file before asking a question.')
      return
    }

    if (!activeQuestion) {
      setError('Type a question for the board.')
      return
    }

    try {
      setStatus('analyzing')
      setError('')
      setHistory((current) => [...current, { role: 'user', content: activeQuestion, meta: 'Fresh prompt' }])

      const payload = await fetchJson(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, question: activeQuestion }),
      })

      startTransition(() => {
        setAnalysis(payload.analysis)
        setHistory((current) => [...current, { role: 'assistant', content: payload.analysis.summary || payload.analysis.title, meta: 'Fresh insight' }])
      })

      setQuestion('')
      setStatus('ready')
      setFocusedViewId('analysis')
      refreshRecentSessions()
    } catch (analysisError) {
      setError(analysisError.message)
      setStatus('ready')
    }
  }

  async function saveBoardSnapshot(options = {}) {
    if (!session?.sessionId) {
      setError('Upload a dataset before saving a board.')
      return null
    }

    const snapshotTitle = analysis?.title ?? 'Saved board'

    if (systemHealth.database) {
      try {
        const payload = await fetchJson(`${API_BASE}/api/boards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            title: snapshotTitle,
            mode: dashboardMode,
            focusedViewId,
          }),
        })

        setSavedBoards((current) => [payload, ...current.filter((item) => item.id !== payload.id)].slice(0, 8))
        refreshBoards()
        if (!options.silent) {
          setNotice(`Saved board: ${payload.title}`)
        }
        return payload
      } catch (saveError) {
        setError(saveError.message)
        return null
      }
    }

    const snapshot = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      sessionId: session.sessionId,
      filename: session.filename,
      mode: dashboardMode,
      focusedViewId,
      title: snapshotTitle,
      savedAt: new Date().toISOString(),
      local: true,
    }

    const next = [snapshot, ...savedBoards].slice(0, 8)
    setSavedBoards(next)
    writeSavedBoards(next)
    if (!options.silent) {
      setNotice(`Saved local board: ${snapshot.title}`)
    }
    return snapshot
  }

  async function shareBoardSnapshot() {
    if (!systemHealth.database) {
      const snapshot = await saveBoardSnapshot({ silent: true })
      if (snapshot) {
        setNotice('Saved locally. Connect MongoDB to enable shareable links across devices.')
      }
      return
    }

    const snapshot = await saveBoardSnapshot({ silent: true })
    if (!snapshot?.id || typeof window === 'undefined' || !navigator.clipboard) {
      return
    }

    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?board=${snapshot.id}`
      await navigator.clipboard.writeText(shareUrl)
      setNotice('Share link copied to clipboard.')
    } catch {
      setError('Clipboard access is unavailable in this browser. Copy the page URL manually after saving.')
    }
  }

  function exportTable(format) {
    if (!analysis?.table?.length || typeof window === 'undefined') {
      setError('Run an analysis with table results before exporting.')
      return
    }

    const filenameBase = (analysis?.title || 'analysis-results').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    let content = ''
    let mimeType = ''
    let extension = ''

    if (format === 'json') {
      content = JSON.stringify(analysis.table, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    } else if (format === 'xls') {
      const headers = Object.keys(analysis.table[0])
      const escapeCell = (value) =>
        String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')

      const headerHtml = headers.map((header) => `<th>${escapeCell(header)}</th>`).join('')
      const rowHtml = analysis.table
        .map(
          (row) =>
            `<tr>${headers.map((header) => `<td>${escapeCell(row[header])}</td>`).join('')}</tr>`,
        )
        .join('')

      content = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
          <head>
            <meta charset="UTF-8" />
          </head>
          <body>
            <table>
              <thead><tr>${headerHtml}</tr></thead>
              <tbody>${rowHtml}</tbody>
            </table>
          </body>
        </html>
      `.trim()
      mimeType = 'application/vnd.ms-excel'
      extension = 'xls'
    } else {
      const headers = Object.keys(analysis.table[0])
      const lines = [
        headers.join(','),
        ...analysis.table.map((row) =>
          headers
            .map((header) => JSON.stringify(row[header] ?? ''))
            .join(','),
        ),
      ]
      content = lines.join('\n')
      mimeType = 'text/csv'
      extension = 'csv'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${filenameBase}.${extension}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    setNotice(`Exported ${extension.toUpperCase()} file.`)
  }

  const analysisCard = analysis
    ? {
        id: 'analysis',
        title: analysis.title ?? 'Latest answer',
        subtitle: analysis.summary ?? 'Latest question result',
        chart:
          analysis.chart ?? {
            type: 'bar',
            xKey: 'label',
            yKey: 'value',
            data: [],
          },
        accent: 'bg-fuchsia-400',
      }
    : null
  const cardMap = Object.fromEntries([...quickViews.map((item) => [item.id, item]), ...(analysisCard ? [[analysisCard.id, analysisCard]] : [])])
  const activePreset = PRESETS.find((preset) => preset.id === dashboardMode) ?? PRESETS[0]
  const heroId = focusedViewId ?? activePreset.order.find((id) => cardMap[id]?.chart?.data?.length) ?? activePreset.order[0]
  const heroCard = cardMap[heroId] ?? analysisCard ?? quickViews[0] ?? { title: 'Lead View', subtitle: 'Waiting for the first insight.', chart: null }
  const availableViewCards = activePreset.order.map((id) => cardMap[id]).filter(Boolean)
  const questionUsage = deferredQuestion.trim().length
  const quality = session?.profile?.quality
  const libraryItems = savedBoards.length
    ? savedBoards.map((item) => ({
        key: item.id,
        label: item.title,
        meta: `${item.filename} | ${item.mode}`,
        time: item.savedAt || item.updatedAt,
        sessionId: item.sessionId,
        options: item,
      }))
    : recentSessions.map((item) => ({
        key: item.sessionId,
        label: item.filename,
        meta: `${item.rowCount} rows | ${item.columns} columns`,
        time: item.updatedAt,
        sessionId: item.sessionId,
        options: item,
      }))
  const librarySummary = libraryItems.length ? `${libraryItems.length} item${libraryItems.length === 1 ? '' : 's'}` : 'Empty'

  return (
    <motion.main 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.8 }} 
      className="min-h-screen">
      <div className="mx-auto max-w-[1660px] px-4 py-8 sm:px-6 xl:px-10">
        <Surface className="p-6 sm:p-8">
          <div className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Surface className="p-6 sm:p-7">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-600">AI Data Analyst Dashboard</div>
                    <h1 className="mt-3 font-serif text-4xl font-semibold text-white sm:text-[3.25rem]">A cleaner way to read data.</h1>
                    <p className="mt-3 max-w-2xl text-[13px] leading-7 text-zinc-500">
                      Upload a dataset, pick a board mode, and ask follow-up questions without losing the visual context.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <StatusChip label={systemHealth.ok ? 'Workspace live' : 'Unavailable'} active={systemHealth.ok} />
                      <StatusChip label={session?.sessionId ? 'Dataset loaded' : 'Awaiting dataset'} active={Boolean(session?.sessionId)} />
                      <StatusChip label={libraryItems.length ? 'Saved views ready' : 'Fresh workspace'} active={Boolean(libraryItems.length)} />
                      <button 
                        type="button" 
                        onClick={() => { localStorage.removeItem('auth_token'); window.location.reload() }}
                        className="ml-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500 transition hover:border-red-400/20 hover:text-red-300 focus:outline-none"
                      >
                        Log out
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                    <FocusItem label="Dataset" value={session?.filename ?? 'No file loaded'} />
                    <FocusItem label="Board mode" value={activePreset.label} />
                    <FocusItem label="Lead view" value={heroCard?.title ?? 'Waiting'} />
                  </div>
                </div>
              </Surface>

              <form className="rounded-[24px] border border-white/[0.06] bg-white/[0.015] p-6" onSubmit={uploadFile}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Upload</div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">Create board</h2>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-500">Load a CSV and the board will generate its first set of views.</p>
                  </div>
                  <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">{status === 'uploading' ? 'Loading' : 'Ready'}</div>
                </div>

                <label className="mt-6 flex cursor-pointer flex-col gap-3 rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.01] p-5 transition hover:border-[#c9a84c]/20 hover:bg-white/[0.02]">
                  <span className="sr-only">Upload CSV file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    aria-label="Upload CSV file"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="text-lg font-medium text-zinc-200">{selectedFile ? selectedFile.name : 'Choose a CSV file'}</span>
                  <span className="text-[13px] leading-6 text-zinc-500">Best results with date, metric, and category fields.</span>
                </label>

                <button type="submit" disabled={status === 'uploading'} className="btn-gold mt-5 w-full rounded-[14px] px-5 py-3.5 text-sm tracking-[0.04em]">
                  {status === 'uploading' ? 'Building board...' : 'Generate board'}
                </button>

                <div className="mt-5 rounded-[16px] border border-white/[0.06] bg-white/[0.01] p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Current dataset</div>
                  <div className="mt-2 text-sm font-medium text-zinc-300">{session?.filename ?? 'No dataset uploaded yet'}</div>
                  <div className="mt-3 text-[12px] leading-5 text-zinc-600">CSV files with dates, categories, and numeric fields produce the richest boards.</div>
                </div>
              </form>
            </div>

            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="grid gap-4 lg:grid-cols-4"
            >
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}>
                <MetricCard label="Rows" value={numberFormatter(session?.profile?.rowCount ?? 0)} description="Records ready to be explored." accent="bg-[#c9a84c]/10 text-[#c9a84c]" />
              </motion.div>
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}>
                <MetricCard label="Columns" value={session?.profile?.columns?.length ?? 0} description="Fields mapped into board logic." accent="bg-zinc-400/10 text-zinc-400" />
              </motion.div>
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}>
                <MetricCard label="Views" value={quickViews.filter((item) => item.chart?.data?.length).length} description="Prepared perspectives on the board." accent="bg-zinc-500/10 text-zinc-300" />
              </motion.div>
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}>
                <MetricCard label="Results" value={analysis?.table?.length ?? 0} description="Supporting rows for the active answer." accent="bg-[#c9a84c]/8 text-[#c9a84c]/80" />
              </motion.div>
            </motion.div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="grid gap-6">
                <Surface className="p-6">
                  <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Board selector</div>
                      <h2 className="mt-2 text-[2rem] font-semibold text-white">Choose the view</h2>
                      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-zinc-500">Switch between overview, ranking, distribution, and latest-answer modes.</p>
                    </div>
                    <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">{quickViews.length ? `${quickViews.length} views loaded` : 'Waiting for first upload'}</div>
                  </div>

                  <div className="mb-6 flex flex-wrap gap-2">
                    {PRESETS.map((preset) => {
                      const isActive = preset.id === activePreset.id
                      return (
                        <button key={preset.id} type="button" aria-pressed={isActive} onClick={() => { setDashboardMode(preset.id); setFocusedViewId(null) }} className={`relative min-w-[150px] rounded-[16px] border px-4 py-3 text-left transition-all duration-300 ${isActive ? 'border-[#c9a84c]/20 text-white' : 'border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1] hover:bg-white/[0.025]'}`}>
                          {isActive && <motion.div layoutId="preset-active" className="absolute inset-0 rounded-[16px] bg-[#c9a84c]/[0.06]" transition={{ type: 'spring', stiffness: 300, damping: 25 }} />}
                          <div className="relative z-10">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{preset.caption}</div>
                            <div className="mt-2 text-sm font-semibold text-white">{preset.label}</div>
                            <p className="mt-1 text-[12px] leading-5 text-zinc-500">{preset.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Auto dashboard views</div>
                        <p className="mt-2 text-[13px] leading-6 text-zinc-500">Each perspective is pre-mapped to a chart style so the board feels curated instead of single-output.</p>
                      </div>
                      <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        {availableViewCards.length ? `${availableViewCards.length} view cards` : 'Waiting for data'}
                      </div>
                    </div>

                    {availableViewCards.length ? (
                      <div className="grid gap-4 xl:grid-cols-3">
                        {availableViewCards.map((item) => (
                          <ViewCard
                            key={item.id}
                            item={item}
                            compact
                            active={item.id === heroId}
                            onFocus={() => setFocusedViewId(item.id)}
                            onRun={item.prompt ? () => runViewPrompt(item) : undefined}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-52 items-center justify-center rounded-[20px] border border-dashed border-white/[0.06] bg-white/[0.01] text-center text-[13px] text-zinc-600">
                        Upload a dataset to unlock multiple dashboard views.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.015] p-5">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">{activePreset.caption}</div>
                          <h3 className="mt-2 text-3xl font-semibold text-white">{heroCard?.title ?? 'Lead View'}</h3>
                          <p className="mt-2 text-[13px] leading-6 text-zinc-500">{heroCard?.subtitle ?? 'Waiting for the first insight.'}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {analysis?.table?.length ? (
                            <>
                              <button type="button" onClick={() => exportTable('csv')} className="btn-gold-outline rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em]">
                                CSV
                              </button>
                              <button type="button" onClick={() => exportTable('xls')} className="btn-gold-outline rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em]">
                                Excel
                              </button>
                              <button type="button" onClick={() => exportTable('json')} className="btn-gold-outline rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em]">
                                JSON
                              </button>
                            </>
                          ) : null}
                          <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">{chartTypeLabel(heroCard?.chart?.type)}</div>
                        </div>
                      </div>
                      <InsightChart chart={heroCard?.chart} height={430} />
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.015] p-5">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Insight brief</div>
                        <h3 className="mt-2 text-xl font-semibold text-white">What this view is showing</h3>
                        <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                          {analysis?.summary ?? 'Pick any prepared view or ask a question to make one of them the lead story.'}
                        </p>
                        <div className="mt-5 grid gap-3">
                          <FocusItem label="Mode" value={activePreset.label} />
                          <FocusItem label="Visual" value={chartTypeLabel(heroCard?.chart?.type)} />
                          <FocusItem label="Export" value={analysis?.table?.length ? 'Ready' : 'Not available yet'} />
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.015] p-5">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Next questions</div>
                        <h3 className="mt-2 text-xl font-semibold text-white">Pivot from this insight</h3>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {promptSuggestions.slice(0, 4).map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              disabled={!session}
                              onClick={(event) => askQuestion(event, prompt)}
                              className="rounded-full border border-white/[0.06] bg-white/[0.015] px-4 py-2 text-[13px] text-zinc-300 transition hover:border-[#c9a84c]/20 hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Surface>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <Surface className="p-6">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Insights</div>
                    <h2 className="mt-2 text-[2rem] font-semibold text-white">Summary</h2>
                    <div className="mt-5 grid gap-3">
                      {(analysis?.insights ?? ['Upload a CSV to generate a narrative across movement, leaders, and contribution.', 'Use the board selector to change the story frame before asking deeper questions.']).map((insight) => (
                        <article key={insight} className="rounded-[18px] border border-white/[0.06] bg-white/[0.015] p-4 text-[13px] leading-6 text-zinc-300">{insight}</article>
                      ))}
                    </div>
                  </Surface>

                  <Surface className="p-6">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Deliverables</div>
                    <h2 className="mt-2 text-3xl font-semibold text-white">Ready to share</h2>
                    <div className="mt-5 grid gap-3">
                      <FocusItem label="Current answer" value={analysis?.title ?? 'No analysis yet'} />
                      <FocusItem label="Data export" value={analysis?.table?.length ? `${analysis.table.length} rows prepared` : 'Run an analysis to export results'} />
                      <FocusItem label="Saved state" value={libraryItems.length ? `${libraryItems.length} view${libraryItems.length === 1 ? '' : 's'}` : 'No saved views yet'} />
                    </div>
                    <p className="mt-5 text-[13px] leading-6 text-zinc-500">
                      Export actions are attached directly to the active chart so the workspace stays focused on insight instead of raw rows.
                    </p>
                  </Surface>
                </div>
              </div>

              <div className="grid gap-6 xl:sticky xl:top-8 self-start">
                <Surface className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Ask</div>
                        <h2 className="mt-2 text-[2rem] font-semibold text-white">Explore the dataset</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => saveBoardSnapshot()} className="btn-gold-outline rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.2em]">Save view</button>
                        <button type="button" onClick={shareBoardSnapshot} className="btn-gold-outline rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.2em]">Share</button>
                      </div>
                    </div>
                  <form className="mt-5 space-y-4" onSubmit={askQuestion}>
                    <label htmlFor="analysis-question" className="sr-only">Ask a natural-language data question</label>
                    <textarea id="analysis-question" value={question} rows="5" onChange={(event) => setQuestion(event.target.value)} placeholder="Show monthly sales trend, compare top products by revenue, or tell me which region is leading." className="min-h-36 w-full rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-white outline-none placeholder:text-zinc-600 transition-all duration-300 focus:border-[#c9a84c]/30 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.04)]" />
                    <div className="flex items-center justify-between gap-4 text-[11px]">
                      <div className="text-zinc-600">
                        {session
                          ? 'Ask in plain English to explore movement, leaders, averages, and contribution.'
                          : 'Upload a dataset first to unlock analysis.'}
                      </div>
                      <div className={questionUsage > QUESTION_LIMIT * 0.9 ? 'text-[#c9a84c]' : 'text-zinc-600'}>
                        {questionUsage}/{QUESTION_LIMIT}
                      </div>
                    </div>
                    <button type="submit" disabled={!session || status === 'analyzing'} className="btn-gold w-full rounded-[14px] px-5 py-3.5 text-sm tracking-[0.04em]">
                      {status === 'analyzing' ? 'Generating answer...' : 'Run analysis'}
                    </button>
                  </form>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {promptSuggestions.slice(0, 4).map((prompt) => (
                      <button key={prompt} type="button" disabled={!session} onClick={(event) => askQuestion(event, prompt)} className="rounded-full border border-white/[0.06] bg-white/[0.015] px-4 py-2 text-[13px] text-zinc-300 transition hover:border-[#c9a84c]/20 hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-50">
                        {prompt}
                      </button>
                    ))}
                  </div>
                  {notice ? <div className="mt-5 rounded-[16px] border border-[#c9a84c]/15 bg-[#c9a84c]/[0.05] px-4 py-3 text-[13px] text-[#e2cc7a]">{notice}</div> : null}
                  {error ? <div className="mt-5 rounded-[16px] border border-rose-400/15 bg-rose-500/[0.06] px-4 py-3 text-[13px] text-rose-300">{error}</div> : null}
                </Surface>

                <Surface className="p-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Library</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Saved views</h2>
                  <div className="mt-2 text-[13px] text-zinc-600">{librarySummary}</div>
                  <div className="mt-5 space-y-3">
                    {libraryItems.length ? libraryItems.slice(0, 6).map((item) => <SessionButton key={item.key} label={item.label} meta={item.meta} time={formatRelativeDate(item.time)} onClick={() => restoreSession(item.sessionId, item.options)} />) : <div className="rounded-[18px] border border-dashed border-white/[0.06] px-4 py-8 text-[13px] text-zinc-600">Saved views and recent datasets will appear here.</div>}
                  </div>
                </Surface>

                <Surface className="hidden p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Recent sessions</div>
                      <h2 className="mt-2 text-xl font-semibold text-white">Recent datasets</h2>
                    </div>
                    <button type="button" onClick={refreshRecentSessions} className="btn-gold-outline rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.2em]">Refresh</button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {recentSessions.length ? recentSessions.map((item) => <SessionButton key={item.sessionId} label={item.filename} meta={`${item.rowCount} rows · ${item.columns} columns`} time={formatRelativeDate(item.updatedAt)} onClick={() => restoreSession(item.sessionId)} />) : <div className="rounded-[18px] border border-dashed border-white/[0.06] px-4 py-8 text-[13px] text-zinc-600">Recent activity appears here when session history is available.</div>}
                  </div>
                </Surface>

                <Surface className="hidden p-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Board context</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Current context</h2>
                  <div className="mt-5" />
                </Surface>

                <Surface className="p-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Dataset details</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Quality snapshot</h2>
                  <div className="mt-5 grid gap-3">
                    <FocusItem label="Completeness" value={quality ? `${Math.round((quality.completenessRatio ?? 1) * 100)}% complete` : 'Waiting for dataset'} />
                    <FocusItem label="Duplicate rows" value={quality ? String(quality.duplicateRowCount ?? 0) : '0'} />
                    <FocusItem label="Missing cells" value={quality ? `${quality.missingCellCount ?? 0} of ${quality.totalCells ?? 0}` : '0'} />
                  </div>
                  <div className="mt-5 space-y-2">
                    {(quality?.warnings?.length ? quality.warnings : ['No quality warnings yet.']).map((warning) => (
                      <div key={warning} className="rounded-[14px] border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[13px] leading-6 text-zinc-400">
                        {warning}
                      </div>
                    ))}
                  </div>
                </Surface>

                <Surface className="overflow-hidden p-0">
                  <div className="border-b border-white/[0.06] px-6 py-5">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Conversation</div>
                    <h2 className="mt-2 text-xl font-semibold text-white">Recent prompts</h2>
                  </div>
                  <div className="p-6">
                    <div className="h-[360px] space-y-3 overflow-auto rounded-[20px] border border-white/[0.06] bg-white/[0.01] p-4">
                      {history.length ? history.map((message, index) => <MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} meta={message.meta} />) : <div className="flex h-full items-center justify-center text-center text-[13px] text-zinc-600">Upload a dataset to begin the analysis trail.</div>}
                    </div>
                  </div>
                </Surface>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </motion.main>
  )
}

