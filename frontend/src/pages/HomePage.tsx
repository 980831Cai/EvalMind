import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  FlaskConical, Bot, ClipboardList, TrendingUp, TrendingDown,
  Clock, CheckCircle2, Zap, ArrowRight, ChevronRight,
  BarChart3, Target, Activity
} from 'lucide-react'
import type { DashboardStats, Agent, TestSuite } from '../types'
import { useI18n } from '../i18n'

interface Props {
  stats: DashboardStats | null
  agents: Agent[]
  testSuites: TestSuite[]
  onNewEval: () => void
  onGoAgents: () => void
  onGoTestSuites: () => void
}

/* ===== Hero Owl — Refined Cartoon Hand-drawn Style ===== */
function HeroOwl({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg-body" x1="10" y1="8" x2="54" y2="56">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="hg-fill" x1="16" y1="12" x2="48" y2="56">
          <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.10" />
        </linearGradient>
        <radialGradient id="hg-iris" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        <radialGradient id="hg-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hg-belly" x1="24" y1="36" x2="40" y2="52">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="hg-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Ear tufts */}
      <path d="M18 16 Q14 6 10 2 Q9 1 10 3 Q11 7 13 12"
        stroke="url(#hg-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M15 14 Q12 8 9 5"
        stroke="#a5b4fc" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d="M46 16 Q50 6 54 2 Q55 1 54 3 Q53 7 51 12"
        stroke="url(#hg-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M49 14 Q52 8 55 5"
        stroke="#a5b4fc" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4" />

      {/* Body */}
      <path d="M32 56 C20 56 10 48 10 35 C10 26 14 20 19 16 C22 13.5 27 12 32 12 C37 12 42 13.5 45 16 C50 20 54 26 54 35 C54 48 44 56 32 56Z"
        fill="url(#hg-fill)" />
      <path d="M32 56 C20 56 10 48 10 35 C10 26 14 20 19 16 C22 13.5 27 12 32 12 C37 12 42 13.5 45 16 C50 20 54 26 54 35 C54 48 44 56 32 56Z"
        stroke="url(#hg-body)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Belly feather texture */}
      <path d="M24 42 Q28 40 32 42 Q36 40 40 42" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.2" />
      <path d="M22 46 Q27 43.5 32 46 Q37 43.5 42 46" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.15" />
      <path d="M24 50 Q28 47.5 32 50 Q36 47.5 40 50" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.1" />
      <ellipse cx="32" cy="46" rx="9" ry="8" fill="url(#hg-belly)" />

      {/* Wings */}
      <path d="M12 32 Q8 38 10 46 Q11 49 13 50 Q14 48 13 44 Q12 40 14 36"
        stroke="url(#hg-body)" strokeWidth="1.5" fill="url(#hg-wing)" strokeLinecap="round" />
      <path d="M52 32 Q56 38 54 46 Q53 49 51 50 Q50 48 51 44 Q52 40 50 36"
        stroke="url(#hg-body)" strokeWidth="1.5" fill="url(#hg-wing)" strokeLinecap="round" />
      <path d="M11 36 Q12 40 12 44" stroke="#818cf8" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M53 36 Q52 40 52 44" stroke="#818cf8" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* Eye sockets */}
      <circle cx="22" cy="30" r="9" fill="rgba(10,8,32,0.7)" />
      <circle cx="42" cy="30" r="9" fill="rgba(10,8,32,0.7)" />
      <circle cx="22" cy="30" r="9" stroke="url(#hg-body)" strokeWidth="1.8" fill="none" />
      <circle cx="42" cy="30" r="9" stroke="url(#hg-body)" strokeWidth="1.8" fill="none" />

      {/* Eye glow */}
      <circle cx="22" cy="30" r="11" fill="url(#hg-eyeglow)" />
      <circle cx="42" cy="30" r="11" fill="url(#hg-eyeglow)" />

      {/* Iris */}
      <circle cx="22" cy="30" r="5.5" fill="url(#hg-iris)" />
      <circle cx="42" cy="30" r="5.5" fill="url(#hg-iris)" />

      {/* Pupils */}
      <circle cx="23" cy="29.5" r="2.8" fill="rgba(5,3,20,0.9)" />
      <circle cx="43" cy="29.5" r="2.8" fill="rgba(5,3,20,0.9)" />

      {/* Eye highlights */}
      <circle cx="24.5" cy="27.5" r="1.8" fill="white" opacity="0.95" />
      <circle cx="44.5" cy="27.5" r="1.8" fill="white" opacity="0.95" />
      <circle cx="21" cy="31.5" r="0.9" fill="white" opacity="0.5" />
      <circle cx="41" cy="31.5" r="0.9" fill="white" opacity="0.5" />
      <circle cx="23.5" cy="29" r="0.5" fill="white" opacity="0.3" />
      <circle cx="43.5" cy="29" r="0.5" fill="white" opacity="0.3" />

      {/* Brow ridges */}
      <path d="M12 22 Q16 17 23 20" stroke="url(#hg-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M52 22 Q48 17 41 20" stroke="url(#hg-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M14 21 Q17 18.5 21 20" stroke="#c7d2fe" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M50 21 Q47 18.5 43 20" stroke="#c7d2fe" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* Beak */}
      <path d="M29 38.5 L32 43.5 L35 38.5 L32 37 Z"
        fill="#f59e0b" opacity="0.9" />
      <path d="M29 38.5 L32 43.5 L35 38.5 L32 37 Z"
        stroke="#d97706" strokeWidth="0.8" fill="none" strokeLinejoin="round" />
      <path d="M30.5 38.5 L32 37.5 L33.5 38.5" stroke="#fde68a" strokeWidth="0.5" fill="none" opacity="0.6" />

      {/* Feet */}
      <path d="M26 55 Q24 57 22 58 M26 55 Q26 57.5 26 59 M26 55 Q28 57 29 58"
        stroke="url(#hg-body)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M38 55 Q36 57 35 58 M38 55 Q38 57.5 38 59 M38 55 Q40 57 42 58"
        stroke="url(#hg-body)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Facial disc lines */}
      <path d="M16 28 Q18 34 22 37" stroke="#a5b4fc" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.2" />
      <path d="M48 28 Q46 34 42 37" stroke="#a5b4fc" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.2" />

      {/* Head feather tuft */}
      <path d="M28 13 Q30 11 32 12 Q34 11 36 13" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.3" />
    </svg>
  )
}

/* ===== Abstract Neural Graph — fills the right side of Hero ===== */
function HeroGraph() {
  const nodes = [
    { x: 40, y: 30, r: 3, color: '#818cf8', delay: 0 },
    { x: 80, y: 15, r: 2.5, color: '#a5b4fc', delay: 0.5 },
    { x: 120, y: 40, r: 3.5, color: '#6366f1', delay: 1 },
    { x: 160, y: 20, r: 2, color: '#c4b5fd', delay: 1.5 },
    { x: 200, y: 50, r: 3, color: '#818cf8', delay: 0.8 },
    { x: 60, y: 65, r: 2, color: '#a78bfa', delay: 1.2 },
    { x: 140, y: 70, r: 2.5, color: '#6366f1', delay: 0.3 },
    { x: 180, y: 75, r: 2, color: '#a5b4fc', delay: 1.8 },
    { x: 100, y: 80, r: 3, color: '#818cf8', delay: 0.6 },
    { x: 220, y: 35, r: 2.5, color: '#c4b5fd', delay: 1.1 },
  ]
  const edges = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[2,6],[4,9],[1,3],[5,8],[8,6],[6,4],[3,9],[8,7]
  ]
  return (
    <svg viewBox="0 0 260 95" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ng-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke="url(#ng-edge)" strokeWidth="1" className="hero-graph-edge"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r * 3} fill={n.color} opacity="0.06" className="hero-graph-pulse"
            style={{ animationDelay: `${n.delay}s` }} />
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity="0.8" className="hero-graph-node"
            style={{ animationDelay: `${n.delay}s` }} />
          <circle cx={n.x} cy={n.y} r={n.r * 0.4} fill="white" opacity="0.6" />
        </g>
      ))}
    </svg>
  )
}

// ===== Mini SVG Charts =====
function TrendChart({ data, color = '#6366f1', height = 48 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 200
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 8) - 4}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`g-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${w},${height}`}
        fill={`url(#g-${color.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RadarChart({ dimensions, size = 180 }: { dimensions: Record<string, number>; size?: number }) {
  const keys = Object.keys(dimensions)
  if (!keys.length) return null
  const n = keys.length
  const cx = size / 2, cy = size / 2, r = size * 0.38
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const gridLevels = [0.25, 0.5, 0.75, 1]
  const points = keys.map((k, i) => {
    const v = Math.min(dimensions[k] ?? 0, 1)
    return `${cx + r * v * Math.cos(angle(i))},${cy + r * v * Math.sin(angle(i))}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ height: size }}>
      {gridLevels.map(lv => (
        <polygon
          key={lv}
          points={keys.map((_, i) => `${cx + r * lv * Math.cos(angle(i))},${cy + r * lv * Math.sin(angle(i))}`).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}
      {keys.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle(i))} y2={cy + r * Math.sin(angle(i))} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      <polygon points={points} fill="rgba(99, 102, 241, 0.15)" stroke="#6366f1" strokeWidth="2" />
      {keys.map((k, i) => {
        const lx = cx + (r + 16) * Math.cos(angle(i))
        const ly = cy + (r + 16) * Math.sin(angle(i))
        return <text key={k} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-text-tertiary text-[9px]">{k}</text>
      })}
    </svg>
  )
}

function DonutChart({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let current = 0
  const cx = size / 2, cy = size / 2, r = size * 0.35, sw = size * 0.09

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ height: size }}>
      {data.map((d, i) => {
        const pct = d.value / total
        const start = current
        current += pct
        const sa = start * Math.PI * 2 - Math.PI / 2
        const ea = current * Math.PI * 2 - Math.PI / 2
        const large = pct > 0.5 ? 1 : 0
        const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa)
        const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea)
        return (
          <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
            fill="none" stroke={d.color} strokeWidth={sw} strokeLinecap="round" />
        )
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-text-primary text-base font-bold">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-text-tertiary text-[9px]">Total</text>
    </svg>
  )
}

// ===== Stat Card — Glass morphism =====
function StatCard({ icon, label, value, trend, gradient, delay = 0 }: {
  icon: React.ReactNode; label: string; value: string | number;
  trend?: number; gradient: string; delay?: number
}) {
  return (
    <div className={`card-glass p-5 animate-fade-up group ${gradient}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm group-hover:bg-white/[0.06] transition-all duration-300">
          {icon}
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-success-400' : 'text-danger-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="stat-number">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

// ===== Quick Start Step — Premium =====
function QuickStartStep({ step, title, desc, action, onClick, done, delay = 0 }: {
  step: number; title: string; desc: string; action: string; onClick: () => void; done: boolean; delay?: number
}) {
  return (
    <div
      className={`card-glass p-5 animate-fade-up flex flex-col h-full group ${done ? 'ring-1 ring-success-500/15' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold
          backdrop-blur-sm transition-all duration-300
          ${done
            ? 'bg-success-500/10 text-success-400 border border-success-500/20'
            : 'bg-brand-500/10 text-brand-400 border border-brand-500/20 group-hover:bg-brand-500/15 group-hover:shadow-glow-brand-sm'}
        `}>
          {done ? <CheckCircle2 size={18} /> : step}
        </div>
        <button
          onClick={onClick}
          className="flex items-center justify-center w-8 h-8 rounded-lg
                     bg-white/[0.03] border border-white/[0.06] text-text-muted
                     hover:text-brand-400 hover:border-brand-500/30 hover:bg-brand-500/5
                     group-hover:translate-x-0.5 transition-all duration-200"
        >
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="flex-1 mb-4">
        <h4 className="text-sm font-semibold text-text-primary mb-1.5 group-hover:text-brand-300 transition-colors duration-200">{title}</h4>
        <p className="text-xs text-text-tertiary leading-relaxed">{desc}</p>
      </div>

      <button
        onClick={onClick}
        className="self-start flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium
                   bg-white/[0.03] text-text-secondary border border-white/[0.06]
                   hover:text-brand-400 hover:border-brand-500/25 hover:bg-brand-500/5
                   transition-all duration-200 active:scale-[0.97]"
      >
        {action}
        <ArrowRight size={12} />
      </button>
    </div>
  )
}

export default function HomePage({ stats, agents, testSuites, onNewEval, onGoAgents, onGoTestSuites }: Props) {
  const { t } = useI18n()
  const [selectedAgent, setSelectedAgent] = useState<string>(agents[0]?.id || '')
  const heroRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)

  const hasAgents = agents.length > 0
  const hasSuites = testSuites.length > 0
  const hasRuns = (stats?.total_eval_runs ?? 0) > 0

  // Mouse-following cursor glow effect
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (cursorRef.current) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      cursorRef.current.style.left = `${e.clientX - rect.left}px`
      cursorRef.current.style.top = `${e.clientY - rect.top}px`
      cursorRef.current.style.opacity = '1'
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (cursorRef.current) {
      cursorRef.current.style.opacity = '0'
    }
  }, [])

  // Score trend data
  const trendData = useMemo(() => {
    const runs = stats?.recent_runs ?? []
    return runs.map(r => r.average_score ?? 0).reverse()
  }, [stats])

  // Dimension data for radar
  const radarData = useMemo(() => stats?.dimension_averages ?? {}, [stats])

  // Distribution for donut
  const distData = useMemo(() => {
    const d = stats?.score_distribution ?? { excellent: 0, good: 0, fair: 0, poor: 0 }
    return [
      { label: t.home.excellent, value: d.excellent, color: '#22c55e' },
      { label: t.home.good, value: d.good, color: '#6366f1' },
      { label: t.home.fair, value: d.fair, color: '#eab308' },
      { label: t.home.poor, value: d.poor, color: '#ef4444' },
    ]
  }, [stats, t])

  const fmt = (v: number | null | undefined, dec = 1) => v != null ? v.toFixed(dec) : '--'

  return (
    <div
      className="page-container relative"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Mouse-following ambient glow */}
      <div
        ref={cursorRef}
        className="pointer-events-none fixed w-[400px] h-[400px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500 z-0"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.03) 30%, transparent 70%)',
          opacity: 0,
        }}
      />

      {/* ===== Hero Section — Pro Max ===== */}
      <div ref={heroRef} className="relative mb-12 animate-fade-in">
        <div className="relative flex items-center gap-6">
          {/* Left: Logo + text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 mb-5">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/10 to-purple-600/10 border border-brand-500/15 flex items-center justify-center">
                <HeroOwl size={52} />
              </div>
              <div>
                <h1 className="text-3xl lg:text-[40px] font-extrabold tracking-tight leading-[1.1]">
                  <span className="text-gradient-animated">{t.home.welcome}</span>
                </h1>
              </div>
            </div>
            <p className="text-text-secondary text-[15px] max-w-lg leading-relaxed mb-5">{t.home.welcomeDesc}</p>
            {/* Status chips */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="status-chip">
                <div className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse-soft" />
                <span>{agents.length} Agents</span>
              </div>
              <div className="status-chip">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                <span>{testSuites.length} Suites</span>
              </div>
              <div className="status-chip">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                <span>{stats?.total_eval_runs ?? 0} Runs</span>
              </div>
            </div>
          </div>

          {/* Right: Abstract neural graph visualization */}
          <div className="hidden lg:block w-[320px] h-[120px] shrink-0 relative">
            <div className="absolute inset-0 opacity-80">
              <HeroGraph />
            </div>
            {/* Gradient fade on edges */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface-1 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-1 to-transparent pointer-events-none z-10" />
          </div>
        </div>

        {/* Bottom separator */}
        <div className="mt-8 h-px bg-gradient-to-r from-transparent via-brand-500/20 to-transparent" />
      </div>

      {/* ===== Quick Start Guide ===== */}
      {(!hasAgents || !hasSuites || !hasRuns) && (
        <div className="mb-12">
          <div className="flex items-center gap-2.5 mb-5">
            <Zap size={16} className="text-accent-400" />
            <h2 className="text-sm font-semibold text-text-primary tracking-wide">{t.home.quickStart}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <QuickStartStep
              step={1} title={t.home.step1Title} desc={t.home.step1Desc}
              action={t.home.goAgents} onClick={onGoAgents} done={hasAgents} delay={0}
            />
            <QuickStartStep
              step={2} title={t.home.step2Title} desc={t.home.step2Desc}
              action={t.home.goTestSuites} onClick={onGoTestSuites} done={hasSuites} delay={100}
            />
            <QuickStartStep
              step={3} title={t.home.step3Title} desc={t.home.step3Desc}
              action={t.home.goEval} onClick={onNewEval} done={hasRuns} delay={200}
            />
          </div>
        </div>
      )}

      {/* Agent Selector */}
      {hasAgents && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs text-text-tertiary font-medium">{t.home.selectAgent}:</span>
          <div className="flex gap-2 flex-wrap">
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                  ${selectedAgent === a.id
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30 shadow-glow-brand-sm'
                    : 'bg-surface-3/50 text-text-secondary border border-border hover:border-border-light hover:bg-surface-3/80'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Stats Grid — Pro Max glass cards ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        <StatCard
          icon={<FlaskConical size={16} className="text-brand-400" />}
          label={t.home.totalEvals}
          value={stats?.total_eval_runs ?? 0}
          gradient="gradient-card-blue"
          delay={0}
        />
        <StatCard
          icon={<ClipboardList size={16} className="text-cyan-400" />}
          label={t.home.totalCases}
          value={stats?.total_eval_results ?? 0}
          gradient="gradient-card-purple"
          delay={60}
        />
        <StatCard
          icon={<Target size={16} className="text-green-400" />}
          label={t.home.avgScore}
          value={fmt(stats?.avg_score)}
          gradient="gradient-card-green"
          delay={120}
        />
        <StatCard
          icon={<Clock size={16} className="text-amber-400" />}
          label={t.home.avgLatency}
          value={stats?.avg_latency_ms != null ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : '--'}
          gradient="gradient-card-orange"
          delay={180}
        />
        <StatCard
          icon={<CheckCircle2 size={16} className="text-emerald-400" />}
          label={t.home.passRate}
          value={stats && stats.total_eval_results > 0
            ? `${((stats.completed_runs / Math.max(stats.total_eval_runs, 1)) * 100).toFixed(0)}%`
            : '--'}
          gradient="gradient-card-green"
          delay={240}
        />
      </div>

      {/* ===== Charts Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
        <div className="card-glass p-5 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-text-primary">{t.home.trendChart}</h3>
            </div>
          </div>
          <div className="h-[120px] flex items-end">
            {trendData.length > 1 ? (
              <TrendChart data={trendData} color="#6366f1" height={120} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-text-muted">{t.common.noData}</div>
            )}
          </div>
        </div>

        <div className="card-glass p-5 animate-fade-up" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-text-primary">{t.home.radarChart}</h3>
          </div>
          <div className="flex items-center justify-center">
            {Object.keys(radarData).length > 0 ? (
              <RadarChart dimensions={radarData} size={160} />
            ) : (
              <div className="w-full h-[160px] flex items-center justify-center text-xs text-text-muted">{t.common.noData}</div>
            )}
          </div>
        </div>

        <div className="card-glass p-5 animate-fade-up" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Target size={14} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-text-primary">{t.home.distributionChart}</h3>
          </div>
          <div className="flex items-center justify-center">
            {distData.some(d => d.value > 0) ? (
              <div className="flex flex-col items-center gap-3">
                <DonutChart data={distData} size={120} />
                <div className="flex flex-wrap gap-3">
                  {distData.map(d => (
                    <div key={d.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-[10px] text-text-tertiary">{d.label} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full h-[160px] flex items-center justify-center text-xs text-text-muted">{t.common.noData}</div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Recent Runs & Dimension Scores ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-glass p-5 animate-fade-up" style={{ animationDelay: '280ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-text-primary">{t.home.recentRuns}</h3>
            </div>
          </div>
          <div className="space-y-1">
            {(stats?.recent_runs ?? []).length > 0 ? (
              stats!.recent_runs.slice(0, 8).map((run, i) => (
                <div key={run.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-all duration-200 group cursor-pointer">
                  <div className={`dot shrink-0 ${
                    run.status === 'completed' ? 'bg-success-400' :
                    run.status === 'running' ? 'bg-brand-400 animate-pulse-soft' :
                    run.status === 'failed' ? 'bg-danger-400' : 'bg-text-muted'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary truncate">{run.agent_name}</div>
                    <div className="text-[10px] text-text-muted truncate">{run.test_suite_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-text-primary">
                      {run.average_score != null ? run.average_score.toFixed(2) : '--'}
                    </div>
                    <div className="text-[10px] text-text-muted">{run.total_items} cases</div>
                  </div>
                  <ChevronRight size={14} className="text-text-muted group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-text-muted">{t.common.noData}</div>
            )}
          </div>
        </div>

        <div className="card-glass p-5 animate-fade-up" style={{ animationDelay: '340ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-accent-400" />
            <h3 className="text-sm font-semibold text-text-primary">{t.home.dimensionScores}</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(stats?.dimension_averages ?? {}).length > 0 ? (
              Object.entries(stats!.dimension_averages).map(([dim, score]) => (
                <div key={dim} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-text-secondary capitalize">{dim}</span>
                    <span className="text-xs font-semibold text-text-primary">{(score as number).toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-surface-4/80 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-spring group-hover:shadow-glow-brand-sm"
                      style={{
                        width: `${Math.min((score as number) * 100, 100)}%`,
                        background: `linear-gradient(90deg, #6366f1, ${(score as number) > 0.7 ? '#22c55e' : (score as number) > 0.4 ? '#eab308' : '#ef4444'})`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-text-muted">{t.common.noData}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
