import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import { LucideAreaChart, LucideBarChart, LucidePieChart, LucideTrendingUp, LucideCornerDownRight, LucideCheckCircle2, LucideLayoutGrid } from 'lucide-react'
import { CHART_COLORS, chartTypeLabel, numberFormatter, axisDateFormatter, labelFormatter } from './premiumHelpers'
import { useState, useEffect } from 'react'

/* ─── Surface ──────────────────────────────────────────── */
export function Surface({ children, className = '', ...props }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`relative rounded-[24px] border border-white/[0.06] bg-white/[0.015] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_20px_60px_rgba(0,0,0,0.15)] backdrop-blur-lg ${className}`}
      {...props}
    >
      {children}
    </motion.section>
  )
}

/* ─── Status Chip ──────────────────────────────────────── */
export function StatusChip({ label, active }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 text-[11px] tracking-[0.08em] text-zinc-400">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[#c9a84c] shadow-[0_0_8px_rgba(201,168,76,0.6)]' : 'bg-zinc-600'}`} />
      {label}
    </div>
  )
}

/* ─── Metric Card ──────────────────────────────────────── */
export function MetricCard({ label, value, description, accent }) {
  return (
    <motion.article
      whileHover={{ y: -3, scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group relative overflow-hidden rounded-[20px] border border-white/[0.06] bg-white/[0.015] p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.025]"
    >
      {/* Top gold accent line on hover */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/0 to-transparent transition-all duration-500 group-hover:via-[#c9a84c]/40" />
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] ${accent}`}>
        <LucideTrendingUp size={11} strokeWidth={2.5} />
        {label}
      </div>
      <div className="mt-4 font-sans text-4xl font-semibold tracking-[-0.04em] text-white tabular-nums">{value}</div>
      <p className="mt-3 text-[13px] leading-6 text-zinc-500">{description}</p>
    </motion.article>
  )
}

/* ─── Typewriter ───────────────────────────────────────── */
function TypewriterEffect({ content }) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    let index = 0
    let text = ''
    const interval = setInterval(() => {
      if (index < content.length) {
        text += content[index]
        setDisplayed(text)
        index++
      } else {
        clearInterval(interval)
      }
    }, 12)
    return () => clearInterval(interval)
  }, [content])
  return <span>{displayed}</span>
}

/* ─── Message Bubble ───────────────────────────────────── */
export function MessageBubble({ role, content, meta }) {
  const isUser = role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
          isUser
            ? 'border border-[#c9a84c]/15 bg-[#c9a84c]/[0.06] text-zinc-200'
            : 'border border-white/[0.06] bg-white/[0.02] text-zinc-300'
        }`}
      >
        <div>{!isUser ? <TypewriterEffect content={content} /> : content}</div>
        {meta ? <div className={`mt-2 text-[11px] flex items-center gap-1.5 ${isUser ? 'text-[#c9a84c]/60' : 'text-zinc-600'}`}><LucideCheckCircle2 size={11} /> {meta}</div> : null}
      </div>
    </motion.div>
  )
}

/* ─── Chart Tooltip ────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-[14px] border border-white/[0.08] bg-[#111113]/90 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500" style={{ color: entry.color }}>{entry.name || 'Value'}</span>
            <span className="font-semibold text-white">{numberFormatter(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

/* ─── Insight Chart ────────────────────────────────────── */
export function InsightChart({ chart, height = 320 }) {
  if (!chart?.data?.length) {
    return (
      <div
        className="flex items-center justify-center rounded-[20px] border border-dashed border-white/[0.08] bg-white/[0.01] text-center text-[13px] text-zinc-600"
        style={{ height }}
      >
        Upload a dataset or run a prompt to bring this view to life.
      </div>
    )
  }

  const pointCount = chart?.data?.length ?? 0

  if (chart.type === 'pie') {
    const legendHeight = Math.max(56, Math.min(96, Math.round(height * 0.28)))
    const chartHeight = Math.max(160, height - legendHeight - 10)
    return (
      <div className="grid gap-3" style={{ height }}>
        <div className="min-h-0 rounded-[18px] border border-white/[0.06] bg-black/[0.12] p-3" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Pie
                data={chart.data}
                dataKey={chart.yKey}
                nameKey={chart.xKey}
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={2}
                preAnimationDuration={200}
                animationDuration={900}
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`${entry.label}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 px-1" style={{ height: legendHeight }}>
          {chart.data.slice(0, 8).map((entry, index) => (
            <div key={`${entry.label}-${index}`} className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="max-w-[160px] truncate">{labelFormatter(entry.label)}</span>
              <span className="text-zinc-300 tabular-nums">{numberFormatter(Number(entry.value) || 0)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (chart.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chart.data} margin={{ top: 14, right: 18, left: 6, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" vertical={false} />
          <XAxis
            dataKey={chart.xKey}
            tick={{ fill: '#71717a', fontSize: 9 }}
            tickMargin={12}
            height={46}
            interval={pointCount <= 10 ? 0 : 'preserveStartEnd'}
            minTickGap={pointCount <= 10 ? 0 : 36}
            axisLine={false}
            tickLine={false}
            tickFormatter={axisDateFormatter}
          />
          <YAxis tickFormatter={numberFormatter} tick={{ fill: '#71717a', fontSize: 10 }} tickMargin={10} width={50} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(201,168,76,0.2)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey={chart.yKey}
            stroke="#c9a84c"
            strokeWidth={2.5}
            dot={{ fill: '#c9a84c', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5, fill: '#e2cc7a', stroke: '#c9a84c', strokeWidth: 2 }}
            animationDuration={1200}
          />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chart.data} margin={{ top: 14, right: 18, left: 6, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" vertical={false} />
        <XAxis
          dataKey={chart.xKey}
          tick={{ fill: '#71717a', fontSize: 9 }}
          tickMargin={12}
          height={50}
          interval={pointCount <= 10 ? 0 : 'preserveStartEnd'}
          minTickGap={pointCount <= 10 ? 0 : 36}
          axisLine={false}
          tickLine={false}
          tickFormatter={labelFormatter}
        />
        <YAxis tickFormatter={numberFormatter} tick={{ fill: '#71717a', fontSize: 10 }} tickMargin={10} width={50} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(201,168,76,0.04)' }} />
        <Bar dataKey={chart.yKey} radius={[8, 8, 0, 0]} animationDuration={1000}>
          {chart.data.map((entry, index) => (
            <Cell key={`${entry.label}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── View Card ────────────────────────────────────────── */
export function ViewCard({ item, compact = false, active = false, onFocus, onRun }) {
  const Icon = item?.chart?.type === 'line' ? LucideAreaChart : item?.chart?.type === 'pie' ? LucidePieChart : LucideBarChart;

  return (
    <motion.article
      layoutId={`card-${item?.id}`}
      whileHover={{ y: -3 }}
      className={`relative overflow-hidden rounded-[24px] border p-5 transition-all duration-300 ${
        active
          ? 'border-[#c9a84c]/20 bg-[linear-gradient(180deg,rgba(201,168,76,0.04),rgba(255,255,255,0.01))] shadow-[0_0_40px_rgba(201,168,76,0.06)]'
          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.025]'
      }`}
    >
      {/* Active gold top line */}
      {active && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/50 to-transparent" />}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            <Icon size={11} />
            {chartTypeLabel(item?.chart?.type)}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{item?.title ?? 'View'}</h3>
          <p className="mt-1 text-[13px] leading-6 text-zinc-500">{item?.subtitle ?? 'Waiting for insight'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFocus}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400 transition hover:border-white/[0.14] hover:bg-white/[0.04]"
          >
            <LucideLayoutGrid size={11} /> Focus
          </button>
          {item?.prompt ? (
            <button
              type="button"
              onClick={onRun}
              className="btn-gold-outline flex items-center gap-1 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
              aria-label={`Run ${item.title}`}
              title={`Run ${item.title}`}
            >
              Run
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 rounded-[18px] border border-white/[0.06] bg-black/[0.10] p-3">
        <InsightChart chart={item?.chart} height={compact ? 240 : 360} />
      </div>
    </motion.article>
  )
}

/* ─── Session Button ───────────────────────────────────── */
export function SessionButton({ label, meta, time, onClick }) {
  const normalizedMeta = String(meta ?? '')
    .replace(/Â·/g, ' | ')
    .replace(/·/g, ' | ')

  return (
    <motion.button
      whileHover={{ x: 3, backgroundColor: 'rgba(255,255,255,0.025)' }}
      type="button"
      onClick={onClick}
      className="group w-full flex-col items-start rounded-[18px] border border-white/[0.06] bg-white/[0.01] px-4 py-4 text-left transition hover:border-white/[0.1]"
    >
      <div className="truncate text-sm font-medium text-zinc-200">{label}</div>
      <div className="mt-2 text-[13px] text-zinc-500">{normalizedMeta}</div>
      <div className="mt-3 flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        {time}
        <LucideCornerDownRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100 text-[#c9a84c]" />
      </div>
    </motion.button>
  )
}

/* ─── Focus Item ───────────────────────────────────────── */
export function FocusItem({ label, value }) {
  return (
    <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.015] px-4 py-3 transition-colors hover:bg-white/[0.025]">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        <span className="h-1 w-1 rounded-full bg-[#c9a84c]/50" />
        {label}
      </div>
      <div className="mt-2 text-sm font-medium leading-6 text-zinc-300">{value}</div>
    </div>
  )
}
