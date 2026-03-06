import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Search, Radio, Star, MessageSquare,
  Bot, ClipboardList, FlaskConical, Gamepad2, Beaker,
  Layers, GitCompare, AlertTriangle, Cpu, Lightbulb,
  Settings, Globe,
  Dna, GitBranch, PanelLeftClose, PanelLeft,
} from 'lucide-react'
import { useI18n } from '../../i18n'

interface SidebarProps {
  agentCount?: number
  testSuiteCount?: number
  traceCount?: number
  runningRuns?: number
  onTracesClick?: () => void
}

interface NavItem {
  path: string
  labelKey: string
  icon: React.ReactNode
  badge?: number | string
  color?: string
}

/* ===== Owl Logo — Refined Cartoon Hand-drawn Style ===== */
function BrandLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Body gradient — rich indigo-to-purple */}
        <linearGradient id="bl-body" x1="10" y1="8" x2="54" y2="56">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        {/* Body fill — softer translucent */}
        <linearGradient id="bl-fill" x1="16" y1="12" x2="48" y2="56">
          <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.10" />
        </linearGradient>
        {/* Eye iris — amber/gold glow */}
        <radialGradient id="bl-iris" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        {/* Eye glow ring */}
        <radialGradient id="bl-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        {/* Belly feather pattern */}
        <linearGradient id="bl-belly" x1="24" y1="36" x2="40" y2="52">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.06" />
        </linearGradient>
        {/* Wing gradient */}
        <linearGradient id="bl-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Ear tufts — expressive hand-drawn curves */}
      <path d="M18 16 Q14 6 10 2 Q9 1 10 3 Q11 7 13 12"
        stroke="url(#bl-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M15 14 Q12 8 9 5"
        stroke="#a5b4fc" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d="M46 16 Q50 6 54 2 Q55 1 54 3 Q53 7 51 12"
        stroke="url(#bl-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M49 14 Q52 8 55 5"
        stroke="#a5b4fc" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4" />

      {/* Body — rounded owl shape with hand-drawn wobble */}
      <path d="M32 56 C20 56 10 48 10 35 C10 26 14 20 19 16 C22 13.5 27 12 32 12 C37 12 42 13.5 45 16 C50 20 54 26 54 35 C54 48 44 56 32 56Z"
        fill="url(#bl-fill)" />
      <path d="M32 56 C20 56 10 48 10 35 C10 26 14 20 19 16 C22 13.5 27 12 32 12 C37 12 42 13.5 45 16 C50 20 54 26 54 35 C54 48 44 56 32 56Z"
        stroke="url(#bl-body)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Belly — scalloped feather texture (3 rows) */}
      <path d="M24 42 Q28 40 32 42 Q36 40 40 42" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.2" />
      <path d="M22 46 Q27 43.5 32 46 Q37 43.5 42 46" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.15" />
      <path d="M24 50 Q28 47.5 32 50 Q36 47.5 40 50" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.1" />
      {/* Belly center area */}
      <ellipse cx="32" cy="46" rx="9" ry="8" fill="url(#bl-belly)" />

      {/* Wings — tucked, hand-drawn feather edges */}
      <path d="M12 32 Q8 38 10 46 Q11 49 13 50 Q14 48 13 44 Q12 40 14 36"
        stroke="url(#bl-body)" strokeWidth="1.5" fill="url(#bl-wing)" strokeLinecap="round" />
      <path d="M52 32 Q56 38 54 46 Q53 49 51 50 Q50 48 51 44 Q52 40 50 36"
        stroke="url(#bl-body)" strokeWidth="1.5" fill="url(#bl-wing)" strokeLinecap="round" />
      {/* Wing feather lines */}
      <path d="M11 36 Q12 40 12 44" stroke="#818cf8" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M53 36 Q52 40 52 44" stroke="#818cf8" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* Eye sockets — large expressive circles with depth */}
      <circle cx="22" cy="30" r="9" fill="rgba(10,8,32,0.7)" />
      <circle cx="42" cy="30" r="9" fill="rgba(10,8,32,0.7)" />
      <circle cx="22" cy="30" r="9" stroke="url(#bl-body)" strokeWidth="1.8" fill="none" />
      <circle cx="42" cy="30" r="9" stroke="url(#bl-body)" strokeWidth="1.8" fill="none" />

      {/* Eye glow ambient */}
      <circle cx="22" cy="30" r="11" fill="url(#bl-eyeglow)" />
      <circle cx="42" cy="30" r="11" fill="url(#bl-eyeglow)" />

      {/* Iris — large golden with radial gradient */}
      <circle cx="22" cy="30" r="5.5" fill="url(#bl-iris)" />
      <circle cx="42" cy="30" r="5.5" fill="url(#bl-iris)" />

      {/* Pupils — dark with slight offset for liveliness */}
      <circle cx="23" cy="29.5" r="2.8" fill="rgba(5,3,20,0.9)" />
      <circle cx="43" cy="29.5" r="2.8" fill="rgba(5,3,20,0.9)" />

      {/* Eye highlights — multiple reflections for depth */}
      <circle cx="24.5" cy="27.5" r="1.8" fill="white" opacity="0.95" />
      <circle cx="44.5" cy="27.5" r="1.8" fill="white" opacity="0.95" />
      <circle cx="21" cy="31.5" r="0.9" fill="white" opacity="0.5" />
      <circle cx="41" cy="31.5" r="0.9" fill="white" opacity="0.5" />
      <circle cx="23.5" cy="29" r="0.5" fill="white" opacity="0.3" />
      <circle cx="43.5" cy="29" r="0.5" fill="white" opacity="0.3" />

      {/* Brow ridges — expressive hand-drawn arches */}
      <path d="M12 22 Q16 17 23 20" stroke="url(#bl-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M52 22 Q48 17 41 20" stroke="url(#bl-body)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Secondary brow accent */}
      <path d="M14 21 Q17 18.5 21 20" stroke="#c7d2fe" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M50 21 Q47 18.5 43 20" stroke="#c7d2fe" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* Beak — refined diamond shape */}
      <path d="M29 38.5 L32 43.5 L35 38.5 L32 37 Z"
        fill="#f59e0b" opacity="0.9" />
      <path d="M29 38.5 L32 43.5 L35 38.5 L32 37 Z"
        stroke="#d97706" strokeWidth="0.8" fill="none" strokeLinejoin="round" />
      {/* Beak highlight */}
      <path d="M30.5 38.5 L32 37.5 L33.5 38.5" stroke="#fde68a" strokeWidth="0.5" fill="none" opacity="0.6" />

      {/* Feet — cute little talons */}
      <path d="M26 55 Q24 57 22 58 M26 55 Q26 57.5 26 59 M26 55 Q28 57 29 58"
        stroke="url(#bl-body)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M38 55 Q36 57 35 58 M38 55 Q38 57.5 38 59 M38 55 Q40 57 42 58"
        stroke="url(#bl-body)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Facial disc lines — signature owl markings */}
      <path d="M16 28 Q18 34 22 37" stroke="#a5b4fc" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.2" />
      <path d="M48 28 Q46 34 42 37" stroke="#a5b4fc" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.2" />

      {/* Head top feather tuft detail */}
      <path d="M28 13 Q30 11 32 12 Q34 11 36 13" stroke="#a5b4fc" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.3" />
    </svg>
  )
}

export default function Sidebar({ agentCount, testSuiteCount, traceCount, runningRuns }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { t, locale, setLocale } = useI18n()

  const navSections: { titleKey: string; items: NavItem[] }[] = [
    {
      titleKey: 'overview',
      items: [
        { path: '/', labelKey: 'dashboard', icon: <LayoutDashboard size={18} strokeWidth={1.7} />, color: 'brand' },
        { path: '/monitor', labelKey: 'monitor', icon: <Activity size={18} strokeWidth={1.7} />, color: 'emerald' },
      ],
    },
    {
      titleKey: 'observability',
      items: [
        { path: '/traces', labelKey: 'traces', icon: <Search size={18} strokeWidth={1.7} />, badge: traceCount && traceCount > 0 ? traceCount : undefined, color: 'cyan' },
        { path: '/scores', labelKey: 'scores', icon: <Star size={18} strokeWidth={1.7} />, color: 'amber' },
        { path: '/online-eval', labelKey: 'onlineEval', icon: <Radio size={18} strokeWidth={1.7} />, color: 'rose' },
        { path: '/annotations', labelKey: 'annotations', icon: <MessageSquare size={18} strokeWidth={1.7} />, color: 'violet' },
      ],
    },
    {
      titleKey: 'evalManagement',
      items: [
        { path: '/settings', labelKey: 'modelConfig', icon: <Settings size={18} strokeWidth={1.7} />, color: 'slate' },
        { path: '/agents', labelKey: 'agents', icon: <Bot size={18} strokeWidth={1.7} />, badge: agentCount && agentCount > 0 ? agentCount : undefined, color: 'brand' },
        { path: '/test-suites', labelKey: 'testSuites', icon: <ClipboardList size={18} strokeWidth={1.7} />, badge: testSuiteCount && testSuiteCount > 0 ? testSuiteCount : undefined, color: 'teal' },
        { path: '/eval-center', labelKey: 'evalCenter', icon: <FlaskConical size={18} strokeWidth={1.7} />, badge: runningRuns && runningRuns > 0 ? runningRuns : undefined, color: 'purple' },
        { path: '/playground', labelKey: 'playground', icon: <Gamepad2 size={18} strokeWidth={1.7} />, color: 'orange' },
        { path: '/experiments', labelKey: 'experiments', icon: <Beaker size={18} strokeWidth={1.7} />, color: 'lime' },
      ],
    },
    {
      titleKey: 'analytics',
      items: [
        { path: '/eval-framework', labelKey: 'evalFramework', icon: <Layers size={18} strokeWidth={1.7} />, color: 'blue' },
        { path: '/comparisons', labelKey: 'comparison', icon: <GitCompare size={18} strokeWidth={1.7} />, color: 'indigo' },
        { path: '/bad-cases', labelKey: 'badCases', icon: <AlertTriangle size={18} strokeWidth={1.7} />, color: 'red' },
        { path: '/skills-analysis', labelKey: 'skillsAnalysis', icon: <Cpu size={18} strokeWidth={1.7} />, color: 'cyan' },
        { path: '/insights', labelKey: 'insights', icon: <Lightbulb size={18} strokeWidth={1.7} />, color: 'yellow' },
      ],
    },
    {
      titleKey: 'improvement',
      items: [
        { path: '/gene-store', labelKey: 'geneStore', icon: <Dna size={18} strokeWidth={1.7} />, color: 'pink' },
        { path: '/evolution', labelKey: 'evolution', icon: <GitBranch size={18} strokeWidth={1.7} />, color: 'emerald' },
      ],
    },
  ]

  const getLabel = (key: string) => (t.nav as Record<string, string>)[key] || key

  const iconColorMap: Record<string, { active: string; glow: string }> = {
    brand:   { active: 'bg-brand-500/15 text-brand-400', glow: 'shadow-[0_0_10px_-2px_rgba(99,102,241,0.4)]' },
    emerald: { active: 'bg-emerald-500/15 text-emerald-400', glow: 'shadow-[0_0_10px_-2px_rgba(52,211,153,0.4)]' },
    cyan:    { active: 'bg-cyan-500/15 text-cyan-400', glow: 'shadow-[0_0_10px_-2px_rgba(34,211,238,0.4)]' },
    amber:   { active: 'bg-amber-500/15 text-amber-400', glow: 'shadow-[0_0_10px_-2px_rgba(251,191,36,0.4)]' },
    rose:    { active: 'bg-rose-500/15 text-rose-400', glow: 'shadow-[0_0_10px_-2px_rgba(251,113,133,0.4)]' },
    violet:  { active: 'bg-violet-500/15 text-violet-400', glow: 'shadow-[0_0_10px_-2px_rgba(167,139,250,0.4)]' },
    slate:   { active: 'bg-slate-500/15 text-slate-300', glow: 'shadow-[0_0_10px_-2px_rgba(148,163,184,0.3)]' },
    teal:    { active: 'bg-teal-500/15 text-teal-400', glow: 'shadow-[0_0_10px_-2px_rgba(45,212,191,0.4)]' },
    purple:  { active: 'bg-purple-500/15 text-purple-400', glow: 'shadow-[0_0_10px_-2px_rgba(168,85,247,0.4)]' },
    orange:  { active: 'bg-orange-500/15 text-orange-400', glow: 'shadow-[0_0_10px_-2px_rgba(251,146,60,0.4)]' },
    lime:    { active: 'bg-lime-500/15 text-lime-400', glow: 'shadow-[0_0_10px_-2px_rgba(163,230,53,0.4)]' },
    blue:    { active: 'bg-blue-500/15 text-blue-400', glow: 'shadow-[0_0_10px_-2px_rgba(96,165,250,0.4)]' },
    indigo:  { active: 'bg-indigo-500/15 text-indigo-400', glow: 'shadow-[0_0_10px_-2px_rgba(129,140,248,0.4)]' },
    red:     { active: 'bg-red-500/15 text-red-400', glow: 'shadow-[0_0_10px_-2px_rgba(248,113,113,0.4)]' },
    yellow:  { active: 'bg-yellow-500/15 text-yellow-400', glow: 'shadow-[0_0_10px_-2px_rgba(250,204,21,0.4)]' },
    pink:    { active: 'bg-pink-500/15 text-pink-400', glow: 'shadow-[0_0_10px_-2px_rgba(244,114,182,0.4)]' },
  }

  return (
    <aside
      className={`
        relative flex flex-col h-screen gradient-sidebar sidebar-edge-glow
        transition-all duration-300 ease-spring z-30 shrink-0
        ${collapsed ? 'w-[68px]' : 'w-[252px]'}
      `}
    >
      {/* ===== Brand Area — Owl Logo ===== */}
      <div className={`flex items-center gap-3 px-4 h-[68px] shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="relative shrink-0 flex items-center justify-center w-11 h-11">
          <BrandLogo size={44} />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0 animate-fade-in">
            <span className="text-[15px] font-bold tracking-tight leading-tight">
              <span className="text-gradient-brand">EvalMind</span>
            </span>
            <span className="text-[10px] text-text-muted leading-tight mt-0.5">{t.app.version} · {t.app.openSource}</span>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="mx-3 section-divider-gradient" />

      {/* ===== Navigation ===== */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2.5 scrollbar-hide">
        {navSections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-3' : ''}>
            {!collapsed ? (
              <div className="flex items-center gap-2.5 px-2.5 mb-1.5 mt-1">
                <span className="text-[10px] font-semibold text-text-muted/80 uppercase tracking-[0.12em] shrink-0">
                  {getLabel(section.titleKey)}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-white/[0.04] to-transparent" />
              </div>
            ) : (
              si > 0 && <div className="mx-3 mb-2 mt-1 section-divider-gradient opacity-50" />
            )}

            <div className="space-y-0.5">
              {section.items.map(item => {
                const colorConf = iconColorMap[item.color || 'brand']
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `
                      group relative flex items-center gap-2.5 rounded-lg transition-all duration-200 nav-hover-shine
                      ${collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'}
                      ${isActive
                        ? 'nav-active-bg'
                        : 'hover:bg-white/[0.03] active:bg-white/[0.05]'
                      }
                    `}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 nav-indicator-bar" />
                        )}

                        <span className={`
                          shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200
                          ${isActive
                            ? `${colorConf.active} ${colorConf.glow}`
                            : 'text-text-tertiary group-hover:text-text-secondary'
                          }
                        `}>
                          {item.icon}
                        </span>

                        {!collapsed && (
                          <>
                            <span className={`
                              text-[13px] font-medium truncate transition-colors duration-200
                              ${isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}
                            `}>
                              {getLabel(item.labelKey)}
                            </span>
                            {item.badge !== undefined && (
                              <span className={`
                                ml-auto shrink-0 min-w-[20px] h-[18px] flex items-center justify-center
                                rounded-full text-[10px] font-bold px-1.5 animate-badge-pulse
                                ${typeof item.badge === 'number' && item.badge > 0
                                  ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/25'
                                  : 'bg-surface-4 text-text-muted'}
                              `}>
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}

                        {collapsed && (
                          <div className="
                            absolute left-full ml-2 px-2.5 py-1.5 rounded-lg
                            bg-surface-3 border border-border-light shadow-elevated
                            text-[12px] font-medium text-text-primary whitespace-nowrap
                            opacity-0 pointer-events-none -translate-x-1
                            group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto
                            transition-all duration-200 z-50
                          ">
                            {getLabel(item.labelKey)}
                            <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 rotate-45 bg-surface-3 border-l border-b border-border-light" />
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ===== Bottom Actions ===== */}
      <div className="shrink-0 sidebar-bottom-glass p-2.5 space-y-0.5">
        <div className="mx-1 mb-1.5 section-divider-gradient" />

        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          className={`
            group w-full flex items-center gap-2.5 rounded-lg text-text-secondary
            hover:text-text-primary hover:bg-white/[0.03] transition-all duration-200
            active:scale-[0.98]
            ${collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'}
          `}
          title={t.settings.language}
        >
          <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-tertiary group-hover:text-brand-400 group-hover:bg-brand-500/10 transition-all duration-200">
            <Globe size={18} strokeWidth={1.7} />
          </span>
          {!collapsed && (
            <span className="text-[13px] font-medium">{locale === 'zh' ? 'English' : '中文'}</span>
          )}
        </button>

        <button
          onClick={() => setCollapsed(c => !c)}
          className={`
            group w-full flex items-center gap-2.5 rounded-lg text-text-secondary
            hover:text-text-primary hover:bg-white/[0.03] transition-all duration-200
            active:scale-[0.98]
            ${collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'}
          `}
          title={collapsed ? getLabel('expandSidebar') : getLabel('collapseSidebar')}
        >
          <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-tertiary group-hover:text-text-secondary transition-all duration-200">
            {collapsed
              ? <PanelLeft size={18} strokeWidth={1.7} />
              : <PanelLeftClose size={18} strokeWidth={1.7} />
            }
          </span>
          {!collapsed && <span className="text-[13px] font-medium">{getLabel('collapseSidebar')}</span>}
        </button>
      </div>
    </aside>
  )
}
