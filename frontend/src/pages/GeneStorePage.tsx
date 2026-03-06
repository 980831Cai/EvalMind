import { useState, useEffect, useCallback } from 'react'
import { Dna, Plus, Upload, Download, Search, Pencil, Trash2, ToggleLeft, ToggleRight, X, Sparkles, Zap, Shield, FlaskConical } from 'lucide-react'
import * as api from '../services/api'
import type { Gene } from '../services/api'
import { useI18n } from '../i18n'

interface Props {
  agents: { id: string; name: string }[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const CATEGORY_META: Record<string, { color: string; gradient: string; icon: typeof Shield }> = {
  repair: { color: 'bg-danger-500/10 text-danger-400 border-danger-500/20', gradient: 'gradient-card-red', icon: Shield },
  optimize: { color: 'bg-brand-500/10 text-brand-400 border-brand-500/20', gradient: 'gradient-card-blue', icon: Zap },
  innovate: { color: 'bg-success-500/10 text-success-400 border-success-500/20', gradient: 'gradient-card-green', icon: Sparkles },
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-surface-4 text-text-secondary border border-border/50',
  bad_case: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  experiment: 'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  import: 'bg-surface-4 text-text-muted border border-border/50',
}

export default function GeneStorePage({ agents, showToast }: Props) {
  const { t } = useI18n()
  const gt = (t.genes || {}) as Record<string, string>

  const [genes, setGenes] = useState<Gene[]>([])
  const [loading, setLoading] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [searchText, setSearchText] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editGene, setEditGene] = useState<Gene | null>(null)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [form, setForm] = useState({
    name: '', description: '', category: 'repair',
    signals_match: '', prompt_patch: '', agent_id: '',
    is_active: true, tags: '',
  })

  const loadGenes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.fetchGenes({
        category: filterCategory || undefined,
        source: filterSource || undefined,
        agent_id: filterAgent || undefined,
        search: searchText || undefined,
        limit: 100,
      })
      setGenes(data)
    } catch { /* global */ }
    setLoading(false)
  }, [filterCategory, filterSource, filterAgent, searchText])

  useEffect(() => { loadGenes() }, [loadGenes])

  const resetForm = () => setForm({ name: '', description: '', category: 'repair', signals_match: '', prompt_patch: '', agent_id: '', is_active: true, tags: '' })

  const openEdit = (g: Gene) => {
    setForm({ name: g.name, description: g.description || '', category: g.category, signals_match: (g.signals_match || []).join(', '), prompt_patch: g.prompt_patch, agent_id: g.agent_id || '', is_active: g.is_active, tags: (g.tags || []).join(', ') })
    setEditGene(g)
    setShowCreate(true)
  }
  const openCreate = () => { resetForm(); setEditGene(null); setShowCreate(true) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt_patch.trim()) { showToast(gt.fillRequired || 'Please fill required fields', 'error'); return }
    const payload = { name: form.name.trim(), description: form.description.trim() || undefined, category: form.category, signals_match: form.signals_match.split(',').map(s => s.trim()).filter(Boolean), prompt_patch: form.prompt_patch.trim(), agent_id: form.agent_id || undefined, is_active: form.is_active, tags: form.tags.split(',').map(s => s.trim()).filter(Boolean) }
    try {
      if (editGene) { await api.updateGene(editGene.id, payload); showToast(gt.updateSuccess) }
      else { await api.createGene({ ...payload, source: 'manual' }); showToast(gt.createSuccess) }
      setShowCreate(false); loadGenes()
    } catch { /* global */ }
  }

  const handleDelete = async (id: string) => {
    try { await api.deleteGene(id); showToast(gt.deleteSuccess); loadGenes() } catch { /* global */ }
    setConfirmDelId(null)
  }
  const handleToggle = async (g: Gene) => { try { await api.updateGene(g.id, { is_active: !g.is_active }); loadGenes() } catch { /* global */ } }

  const handleExport = async () => {
    try {
      const data = await api.exportGenes({ agent_id: filterAgent || undefined, category: filterCategory || undefined })
      const blob = new Blob([JSON.stringify(data.genes, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `genes-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
    } catch { /* global */ }
  }

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importJson); const genesArr = Array.isArray(parsed) ? parsed : parsed.genes || []
      await api.importGenes({ genes: genesArr }); showToast(gt.importSuccess); setShowImport(false); setImportJson(''); loadGenes()
    } catch (e: unknown) { showToast(e instanceof SyntaxError ? (gt.jsonFormatError || 'JSON format error') : (gt.importFailed || 'Import failed'), 'error') }
  }

  const catLabel = (c: string) => ({ repair: gt.categoryRepair, optimize: gt.categoryOptimize, innovate: gt.categoryInnovate }[c] || c)
  const srcLabel = (s: string) => ({ manual: gt.sourceManual, bad_case: gt.sourceBadCase, experiment: gt.sourceExperiment, import: gt.sourceImport }[s] || s)
  const repairCount = genes.filter(g => g.category === 'repair').length
  const optimizeCount = genes.filter(g => g.category === 'optimize').length
  const innovateCount = genes.filter(g => g.category === 'innovate').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">

        {/* Hero Header */}
        <div className="relative page-hero-glow animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 shadow-glow-brand-sm">
                  <Dna size={22} className="text-brand-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  <span className="text-gradient-brand">{gt.title}</span>
                </h1>
              </div>
              <p className="text-sm text-text-secondary ml-[52px]">{gt.desc}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-surface-3 hover:border-border-light transition-all text-sm active:scale-[0.98]">
                <Upload size={14} /> {gt.importGenes}
              </button>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-surface-3 hover:border-border-light transition-all text-sm active:scale-[0.98]">
                <Download size={14} /> {gt.exportGenes}
              </button>
              <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white text-sm font-medium transition-all shadow-glow-brand-sm hover:shadow-glow-brand active:scale-[0.98]">
                <Plus size={14} /> {gt.createGene}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: gt.totalStrategies, value: genes.length, color: 'text-brand-400', gradient: 'gradient-card-purple', icon: Dna, pct: 100 },
            { label: catLabel('repair'), value: repairCount, color: 'text-danger-400', gradient: 'gradient-card-red', icon: Shield, pct: genes.length ? (repairCount / genes.length) * 100 : 0 },
            { label: catLabel('optimize'), value: optimizeCount, color: 'text-brand-400', gradient: 'gradient-card-blue', icon: Zap, pct: genes.length ? (optimizeCount / genes.length) * 100 : 0 },
            { label: catLabel('innovate'), value: innovateCount, color: 'text-success-400', gradient: 'gradient-card-green', icon: Sparkles, pct: genes.length ? (innovateCount / genes.length) * 100 : 0 },
          ].map((s, i) => (
            <div key={i} className={`card-glow p-4 ${s.gradient} animate-reveal`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="p-1.5 rounded-lg bg-surface-3/80 border border-border/50">
                  <s.icon size={14} className={s.color} />
                </div>
              </div>
              <div className={`text-2xl font-bold tracking-tight ${s.color} animate-count-up`}>{s.value}</div>
              <div className="text-xs text-text-muted mt-1">{s.label}</div>
              {i > 0 && (
                <div className="progress-bar mt-3">
                  <div className={`progress-bar-fill${s.color.includes('danger') ? '-danger' : s.color.includes('success') ? '-success' : ''}`} style={{ width: `${s.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="glass rounded-xl p-3 flex items-center gap-3 flex-wrap animate-reveal" style={{ animationDelay: '200ms' }}>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={gt.searchPlaceholder || gt.name}
              className="input pl-9" />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="select min-w-[120px]">
            <option value="">{gt.allCategories || gt.category}</option>
            <option value="repair">{catLabel('repair')}</option>
            <option value="optimize">{catLabel('optimize')}</option>
            <option value="innovate">{catLabel('innovate')}</option>
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="select min-w-[120px]">
            <option value="">{gt.allSources || gt.source}</option>
            <option value="manual">{srcLabel('manual')}</option>
            <option value="bad_case">{srcLabel('bad_case')}</option>
            <option value="experiment">{srcLabel('experiment')}</option>
            <option value="import">{srcLabel('import')}</option>
          </select>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="select min-w-[140px]">
            <option value="">{gt.allAgents}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Gene Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : genes.length === 0 ? (
          <div className="empty-state-ambient flex flex-col items-center justify-center py-24 text-text-tertiary animate-fade-in">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border mb-5">
              <Dna size={32} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-secondary">{gt.noGenes}</p>
            <p className="text-xs mt-1.5 text-text-muted max-w-[300px] text-center">{gt.noGenesHint}</p>
            <button onClick={openCreate} className="mt-5 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-all shadow-glow-brand-sm active:scale-[0.98]">
              <Plus size={14} /> {gt.createGene}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {genes.map((g, i) => {
              const meta = CATEGORY_META[g.category] || CATEGORY_META.repair
              const CatIcon = meta.icon
              return (
                <div key={g.id} className={`group card-premium p-5 ${meta.gradient} animate-reveal`} style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-start gap-4">
                    {/* Category icon */}
                    <div className={`p-2 rounded-lg shrink-0 ${g.is_active ? 'bg-surface-3/80 border border-border/50' : 'bg-surface-4/50 opacity-50'}`}>
                      <CatIcon size={16} className={g.is_active ? meta.color.split(' ')[1] : 'text-text-muted'} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${g.is_active ? 'text-text-primary' : 'text-text-tertiary'}`}>{g.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.color}`}>{catLabel(g.category)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[g.source] || 'bg-surface-4 text-text-muted'}`}>{srcLabel(g.source)}</span>
                        {!g.is_active && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-4 text-text-muted">{gt.inactive}</span>}
                      </div>

                      {g.description && <p className="text-xs text-text-tertiary mt-1.5 line-clamp-1">{g.description}</p>}

                      {/* Effectiveness bar */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-[11px] text-text-muted shrink-0">{gt.effectiveness}</span>
                        <div className="progress-bar flex-1">
                          <div className="progress-bar-fill" style={{ width: `${(g.effectiveness || 0) * 100}%` }} />
                        </div>
                        <span className="text-[11px] font-medium text-text-secondary">{((g.effectiveness || 0) * 100).toFixed(0)}%</span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2.5 text-[11px] text-text-muted">
                        {g.signals_match?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <FlaskConical size={10} />
                            {g.signals_match.slice(0, 2).join(', ')}{g.signals_match.length > 2 ? ` +${g.signals_match.length - 2}` : ''}
                          </span>
                        )}
                        <span>{gt.usageCount}: {g.usage_count}</span>
                        {g.agent_id && <span>Agent: {agents.find(a => a.id === g.agent_id)?.name || g.agent_id.slice(0, 8)}</span>}
                      </div>

                      {/* Code preview */}
                      <div className="mt-3 p-2.5 rounded-lg bg-surface-0/50 border border-border/30 code-accent-bar">
                        <pre className="text-[11px] text-text-secondary line-clamp-2 whitespace-pre-wrap font-mono">{g.prompt_patch}</pre>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0">
                      <button onClick={() => handleToggle(g)} className="p-1.5 rounded-lg hover:bg-surface-4 text-text-tertiary hover:text-text-primary transition-all" title={g.is_active ? gt.active : gt.inactive}>
                        {g.is_active ? <ToggleRight size={16} className="text-success-400" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-surface-4 text-text-tertiary hover:text-text-primary transition-all">
                        <Pencil size={13} />
                      </button>
                      {confirmDelId === g.id ? (
                        <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg bg-danger-500/10 text-danger-400 text-[10px] font-medium">{gt.confirmDelete ? '✓' : '✓'}</button>
                      ) : (
                        <button onClick={() => { setConfirmDelId(g.id); setTimeout(() => setConfirmDelId(null), 3000) }} className="p-1.5 rounded-lg hover:bg-danger-500/10 text-text-tertiary hover:text-danger-400 transition-all">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-1 border border-border rounded-xl w-[600px] max-h-[80vh] overflow-y-auto shadow-modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="glow-line" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-text-primary">{editGene ? gt.editGene : gt.createGene}</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.name} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder={gt.namePlaceholder} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.category}</label>
                <div className="flex gap-2">
                  {(['repair', 'optimize', 'innovate'] as const).map(cat => {
                    const m = CATEGORY_META[cat]; const Icon = m.icon
                    return (
                      <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.97] ${form.category === cat ? m.color : 'border-border text-text-muted hover:border-border-light'}`}>
                        <Icon size={12} /> {catLabel(cat)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.signalsMatch}</label>
                <input value={form.signals_match} onChange={e => setForm(f => ({ ...f, signals_match: e.target.value }))} className="input" placeholder={gt.signalsPlaceholder} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.promptPatch} *</label>
                <textarea value={form.prompt_patch} onChange={e => setForm(f => ({ ...f, prompt_patch: e.target.value }))} rows={5} className="input font-mono" placeholder={gt.promptPatchPlaceholder} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.linkedAgent}</label>
                  <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} className="select">
                    <option value="">{gt.noLimit || '-'}</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.tags}</label>
                  <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className="input" placeholder={gt.tagsPlaceholder} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{gt.description}</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="input" placeholder={gt.descPlaceholder} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-all active:scale-[0.98]">{gt.cancel}</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white text-sm font-medium transition-all shadow-glow-brand-sm active:scale-[0.98]">
                {editGene ? gt.save : gt.create}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowImport(false)}>
          <div className="bg-surface-1 border border-border rounded-xl w-[500px] shadow-modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="glow-line" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-text-primary">{gt.importGenes}</h3>
              <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted transition-all"><X size={16} /></button>
            </div>
            <div className="p-5">
              <textarea value={importJson} onChange={e => setImportJson(e.target.value)} rows={10}
                className="input font-mono" placeholder={gt.importPlaceholder || 'Paste JSON...'} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-all">{gt.cancel}</button>
              <button onClick={handleImport} disabled={!importJson.trim()} className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-medium disabled:opacity-40 transition-all active:scale-[0.98]">
                {gt.importGenes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
