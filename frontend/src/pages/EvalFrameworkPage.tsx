import { useState, useEffect } from 'react'
import { Layers, Plus, Copy, Trash2, Edit2, ChevronDown, ChevronUp, Sparkles, Shield, BookOpen, Wrench } from 'lucide-react'
import type { EvalTemplate, EvalDimension } from '../types'
import * as api from '../services/api'
import { categoryLabel, categoryColor, scoringMethodLabel, scoringMethodColor, dimensionLabel } from '../utils/helpers'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const CATEGORIES = ['generic', 'customer_service', 'coding', 'rag', 'ops_troubleshooting']
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  generic: <Sparkles size={18} />, customer_service: <Shield size={18} />,
  coding: <BookOpen size={18} />, rag: <Layers size={18} />, ops_troubleshooting: <Wrench size={18} />,
}

const defaultForm = { name: '', category: 'generic', description: '', dimension_config: [] as Array<{ dimensionId: string; weight: number; enabled: boolean }> }

export default function EvalFrameworkPage({ showToast }: Props) {
  const [templates, setTemplates] = useState<EvalTemplate[]>([])
  const [dimensions, setDimensions] = useState<EvalDimension[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [showDimPanel, setShowDimPanel] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [expandedDimId, setExpandedDimId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [tpls, dims] = await Promise.all([api.fetchTemplates(), api.fetchDimensions()])
      setTemplates(tpls)
      setDimensions(dims)
    } catch (e: unknown) {
      showToast(`加载数据失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    }
  }

  useEffect(() => { load() }, [])

  const builtinTemplates = templates.filter(t => t.is_builtin)
  const customTemplates = templates.filter(t => !t.is_builtin)

  const openCreate = () => {
    setForm({ ...defaultForm, dimension_config: dimensions.map(d => ({ dimensionId: d.id, weight: d.weight, enabled: true })) })
    setEditId(null)
    setShowModal(true)
  }

  const openEdit = (t: EvalTemplate) => {
    setForm({ name: t.name, category: t.category, description: t.description || '', dimension_config: t.dimension_config })
    setEditId(t.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (editId) await api.updateTemplate(editId, form)
      else await api.createTemplate(form)
      showToast(editId ? '模板已更新' : '模板已创建')
      setShowModal(false)
      load()
    } catch (e: unknown) {
      showToast(`操作失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    }
  }

  const handleCopy = async (id: string) => {
    try {
      await api.copyTemplate(id)
      showToast('模板已复制')
      load()
    } catch (e: unknown) {
      showToast(`复制失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    }
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTemplate(id)
      showToast('已删除')
      setDeleteConfirmId(null)
      load()
    } catch (e: unknown) {
      showToast(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    }
  }

  const toggleDimInForm = (dimId: string) => {
    const existing = form.dimension_config.find(d => d.dimensionId === dimId)
    if (existing) {
      setForm({ ...form, dimension_config: form.dimension_config.map(d => d.dimensionId === dimId ? { ...d, enabled: !d.enabled } : d) })
    } else {
      setForm({ ...form, dimension_config: [...form.dimension_config, { dimensionId: dimId, weight: 1.0, enabled: true }] })
    }
  }

  const updateDimWeight = (dimId: string, weight: number) => {
    setForm({ ...form, dimension_config: form.dimension_config.map(d => d.dimensionId === dimId ? { ...d, weight } : d) })
  }

  const getDimById = (id: string) => dimensions.find(d => d.id === id)

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Layers size={20} /> 评估框架</h2>
          <p className="text-xs text-text-tertiary mt-1">管理评估模板和维度配置，为不同业务场景选择最优评估方案</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowDimPanel(!showDimPanel)}>
            {showDimPanel ? '隐藏维度' : '查看维度'}
          </Button>
          <Button onClick={openCreate} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
            <Plus size={14} className="mr-1" />创建模板
          </Button>
        </div>
      </div>

      {/* 预置模板卡片 */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">预置模板</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {builtinTemplates.map(t => {
            const color = categoryColor(t.category)
            return (
              <div key={t.id} className="relative card p-4 hover:border-border-light transition-all group">
                <div className="absolute top-3 right-3">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20">内置</span>
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${color}15`, color }}>
                  {CATEGORY_ICONS[t.category] || <Layers size={18} />}
                </div>
                <h4 className="text-sm font-semibold text-text-primary mb-1">{t.name}</h4>
                <p className="text-xs text-text-tertiary mb-3 line-clamp-2">{t.description || '无描述'}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.dimension_config.filter(dc => dc.enabled).slice(0, 5).map(dc => {
                    const dim = getDimById(dc.dimensionId)
                    return dim ? (
                      <span key={dc.dimensionId} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                        {dim.display_name}
                      </span>
                    ) : null
                  })}
                  {t.dimension_config.filter(dc => dc.enabled).length > 5 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-tertiary">
                      +{t.dimension_config.filter(dc => dc.enabled).length - 5}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleCopy(t.id)} className="flex-1 text-[11px] text-text-secondary hover:text-text-primary bg-surface-3 hover:bg-surface-4 rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors">
                    <Copy size={11} /> 复制
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 自定义模板列表 */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">自定义模板</h3>
        {customTemplates.length === 0 ? (
          <div className="bg-surface-2/50 border border-border rounded-xl p-8 text-center">
            <p className="text-xs text-text-tertiary">暂无自定义模板，点击「创建模板」或复制预置模板</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customTemplates.map(t => {
              const color = categoryColor(t.category)
              return (
                <div key={t.id} className="flex items-center justify-between card rounded-lg px-4 py-3 hover:border-border-light transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{t.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color, backgroundColor: `${color}15` }}>
                          {categoryLabel(t.category)}
                        </span>
                      </div>
                      <p className="text-xs text-text-tertiary mt-0.5">{t.description || '无描述'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(t)} className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"><Edit2 size={12} /></button>
                    <button onClick={() => handleCopy(t.id)} className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"><Copy size={12} /></button>
                    {deleteConfirmId === t.id ? (
                      <span className="flex items-center gap-1">
                        <button onClick={() => handleDelete(t.id)} className="text-[10px] text-red-400 hover:text-red-300 bg-red-900/30 px-1.5 py-0.5 rounded">确认</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] text-text-tertiary hover:text-text-secondary px-1.5 py-0.5 rounded">取消</button>
                      </span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(t.id); setTimeout(() => setDeleteConfirmId(prev => prev === t.id ? null : prev), 3000) }} className="text-[11px] text-red-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 维度面板 */}
      {showDimPanel && (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">评估维度库</h3>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setFilterCategory('')} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${!filterCategory ? 'bg-surface-3 border-border-light text-text-primary' : 'bg-transparent border-border text-text-tertiary hover:border-border-light'}`}>全部</button>
            {['universal', 'category'].map(l => (
              <button key={l} onClick={() => setFilterCategory(l)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${filterCategory === l ? 'bg-surface-3 border-border-light text-text-primary' : 'bg-transparent border-border text-text-tertiary hover:border-border-light'}`}>
                {l === 'universal' ? '通用层' : '类型层'}
              </button>
            ))}
            <button onClick={() => setFilterCategory('referenceless')} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${filterCategory === 'referenceless' ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300' : 'bg-transparent border-border text-text-tertiary hover:border-border-light'}`}>
              免参考
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dimensions.filter(d => !filterCategory || (filterCategory === 'referenceless' ? !d.requires_reference : d.layer === filterCategory)).map(d => {
              const mColor = scoringMethodColor(d.scoring_method)
              const isExpanded = expandedDimId === d.id
              return (
                <div key={d.id} className="bg-surface-0 border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1 cursor-pointer" onClick={() => setExpandedDimId(isExpanded ? null : d.id)}>
                    <span className="text-sm font-medium text-text-primary">{d.display_name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: mColor, backgroundColor: `${mColor}15` }}>
                        {scoringMethodLabel(d.scoring_method)}
                      </span>
                      {isExpanded ? <ChevronUp size={12} className="text-text-tertiary" /> : <ChevronDown size={12} className="text-text-tertiary" />}
                    </div>
                  </div>
                  <p className="text-xs text-text-tertiary line-clamp-2">{d.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
                    <span>层级: {d.layer === 'universal' ? '通用' : '类型'}</span>
                    <span>·</span>
                    <span>权重: {d.weight}</span>
                    {!d.requires_reference && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">免参考</span>
                      </>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 divider space-y-2.5">
                      {d.scoring_criteria && (
                        <div>
                          <div className="text-[10px] font-semibold text-brand-400 mb-1">评分标准</div>
                          <div className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed bg-surface-2 rounded-md p-2">{d.scoring_criteria}</div>
                        </div>
                      )}
                      {d.evaluation_steps && (
                        <div>
                          <div className="text-[10px] font-semibold text-emerald-400 mb-1">评估步骤</div>
                          <div className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed bg-surface-2 rounded-md p-2">{d.evaluation_steps}</div>
                        </div>
                      )}
                      {!d.scoring_criteria && !d.evaluation_steps && (
                        <div className="text-[11px] text-text-muted">暂无详细评分准则</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 创建/编辑模板弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? '编辑' : '创建'}评估模板</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">模板名称</label>
              <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">业务类别</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">描述</label>
            <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">维度配置</label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {dimensions.map(d => {
                const dc = form.dimension_config.find(c => c.dimensionId === d.id)
                const enabled = dc?.enabled ?? false
                const weight = dc?.weight ?? d.weight
                return (
                  <div key={d.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${enabled ? 'bg-surface-2 border-border-light' : 'bg-surface-0 border-border/50 opacity-60'}`}>
                    <input type="checkbox" checked={enabled} onChange={() => toggleDimInForm(d.id)} className="accent-brand-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-primary">{d.display_name}</span>
                      <span className="text-[10px] text-text-muted ml-2">{d.layer === 'universal' ? '通用' : '类型'}</span>
                      {!d.requires_reference && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded ml-1">免参考</span>}
                    </div>
                    {enabled && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-text-tertiary">权重</span>
                        <input type="number" step="0.1" min="0" max="5" className="w-16 bg-surface-3 border border-border-light rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-500" value={weight} onChange={e => updateDimWeight(d.id, parseFloat(e.target.value) || 0)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>取消</Button>
          <Button onClick={handleSave} disabled={!form.name}>{editId ? '保存' : '创建'}</Button>
        </div>
      </Modal>
    </div>
  )
}
