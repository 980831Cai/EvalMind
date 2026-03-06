import { useState } from 'react'
import { Users, Plus, Trash2, Edit2, Zap, Loader2, FolderPlus, ChevronRight, ChevronDown, File, FileText, Code, BookOpen, Folder, FolderOpen, Radio, MoreHorizontal, Copy, FolderInput } from 'lucide-react'
import type { Agent, Skill } from '../types'
import { createAgent, updateAgent, deleteAgent, testAgent } from '../services/api'
import { useI18n } from '../i18n'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import PasswordInput from '../components/ui/PasswordInput'

interface Props {
  agents: Agent[]
  onRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}

// ===== Skill Tree Node Component =====
interface SkillTreeNodeProps {
  skill: Skill
  path: number[]
  depth: number
  expandedSkills: Set<string>
  editingSkill: string | null
  toggleExpand: (key: string) => void
  setEditingSkill: (key: string | null) => void
  updateSkill: (path: number[], field: keyof Skill, val: string) => void
  removeSkill: (path: number[]) => void
  addSkill: (parentPath?: number[]) => void
  addFolder: (parentPath?: number[]) => void
  duplicateSkill: (path: number[]) => void
  ag: Record<string, string>
}

function SkillTreeNode({
  skill, path, depth, expandedSkills, editingSkill,
  toggleExpand, setEditingSkill, updateSkill, removeSkill, addSkill, addFolder, duplicateSkill, ag
}: SkillTreeNodeProps) {
  const key = path.join('-')
  const hasChildren = skill.children && skill.children.length > 0
  const isFolder = hasChildren || skill.name?.endsWith('/') || (skill.children !== undefined)
  const isExpanded = expandedSkills.has(key)
  const isEditing = editingSkill === key
  const isDetailOpen = expandedSkills.has(`${key}:detail`)
  const [showActions, setShowActions] = useState(false)

  const indent = depth * 20

  return (
    <div className="select-none">
      {/* Main row */}
      <div
        className={`group flex items-center gap-1 py-1 px-2 rounded-md transition-colors cursor-pointer
          ${isEditing ? 'bg-brand-500/10 border border-brand-500/30' : 'hover:bg-surface-3/50 border border-transparent'}
        `}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={() => {
          if (isFolder) toggleExpand(key)
          else toggleExpand(`${key}:detail`)
        }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditingSkill(key) }}
      >
        {/* Expand/collapse icon for folders */}
        <span className="w-4 flex-shrink-0 flex items-center justify-center">
          {isFolder ? (
            isExpanded
              ? <ChevronDown size={14} className="text-text-secondary" />
              : <ChevronRight size={14} className="text-text-secondary" />
          ) : null}
        </span>

        {/* File/Folder icon */}
        <span className="w-4 flex-shrink-0 flex items-center justify-center">
          {isFolder ? (
            isExpanded
              ? <FolderOpen size={14} className="text-amber-400" />
              : <Folder size={14} className="text-amber-400/70" />
          ) : (
            <File size={13} className={`${isDetailOpen ? 'text-brand-400' : 'text-text-tertiary'}`} />
          )}
        </span>

        {/* Name */}
        {isEditing ? (
          <input
            autoFocus
            className="flex-1 input-sm rounded px-2 py-0.5 text-[12px] text-text-primary outline-none focus:border-brand-500 min-w-0"
            placeholder={isFolder ? ag.folderName : ag.skillName}
            value={skill.name}
            onClick={e => e.stopPropagation()}
            onChange={e => updateSkill(path, 'name', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingSkill(null) }}
            onBlur={() => setEditingSkill(null)}
          />
        ) : (
          <span className={`flex-1 text-[12px] truncate ${skill.name ? 'text-text-primary' : 'text-text-muted italic'}`}>
            {skill.name || (isFolder ? ag.unnamedFolder : ag.unnamedSkill)}
          </span>
        )}

        {/* Quick info badges */}
        {!isEditing && !isFolder && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {skill.instructions && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" title={ag.hasInstructions} />}
            {(skill.references || skill.examples) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title={ag.hasResources} />}
            {(skill.scripts && skill.scripts.length > 0) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={ag.hasScripts} />}
          </div>
        )}

        {/* Inline description for non-folders */}
        {!isEditing && !isFolder && skill.description && (
          <span className="text-[10px] text-text-muted truncate max-w-[150px] hidden lg:block">{skill.description}</span>
        )}

        {/* Action menu */}
        {!isEditing && (
          <div className="relative flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {isFolder && (
              <>
                <button onClick={e => { e.stopPropagation(); addSkill(path) }} className="p-0.5 text-text-muted hover:text-brand-400 rounded" title={ag.newSkill}>
                  <Plus size={12} />
                </button>
                <button onClick={e => { e.stopPropagation(); addFolder(path) }} className="p-0.5 text-text-muted hover:text-amber-400 rounded" title={ag.newSubFolder}>
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            <button onClick={e => { e.stopPropagation(); setShowActions(!showActions) }} className="p-0.5 text-text-muted hover:text-text-secondary rounded">
              <MoreHorizontal size={12} />
            </button>
            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-6 z-20 input-sm rounded-lg shadow-xl py-1 min-w-[120px]">
                  <button onClick={e => { e.stopPropagation(); setEditingSkill(key); setShowActions(false) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-3 flex items-center gap-2">
                    <Edit2 size={11} /> {ag.rename}
                  </button>
                  {!isFolder && (
                    <button onClick={e => { e.stopPropagation(); toggleExpand(`${key}:detail`); setShowActions(false) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-3 flex items-center gap-2">
                      <FileText size={11} /> {ag.editDetail}
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); duplicateSkill(path); setShowActions(false) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-3 flex items-center gap-2">
                    <Copy size={11} /> {ag.copy}
                  </button>
                  {!isFolder && !hasChildren && (
                    <button onClick={e => { e.stopPropagation(); addSkill(path); setShowActions(false) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:bg-surface-3 flex items-center gap-2">
                      <FolderInput size={11} /> {ag.convertToFolder}
                    </button>
                  )}
                  <div className="divider my-1" />
                  <button onClick={e => { e.stopPropagation(); removeSkill(path); setShowActions(false) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-950/30 flex items-center gap-2">
                    <Trash2 size={11} /> {ag.delete}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Detail panel (for leaf nodes) */}
      {isDetailOpen && !isFolder && (
        <div className="ml-4 mr-2 mt-1 mb-2 bg-surface-0/80 border border-border/60 rounded-lg overflow-hidden" style={{ marginLeft: `${16 + indent}px` }}>
          {/* Tabs */}
          <div className="flex border-b border-border/60">
            {[
              { id: 'info', label: ag.basicInfo, icon: <File size={10} /> },
              { id: 'instructions', label: ag.instructions, icon: <FileText size={10} />, dot: !!skill.instructions },
              { id: 'resources', label: ag.resources, icon: <BookOpen size={10} />, dot: !!(skill.references || skill.examples) },
              { id: 'scripts', label: ag.scripts, icon: <Code size={10} />, dot: !!(skill.scripts && skill.scripts.length > 0) },
            ].map(tab => (
              <button key={tab.id}
                onClick={(e) => { e.stopPropagation(); toggleExpand(`${key}:tab:${tab.id}`) }}
                className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${
                  expandedSkills.has(`${key}:tab:${tab.id}`)
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab.icon} {tab.label}
                {tab.dot && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5" onClick={e => e.stopPropagation()}>
            {/* Info tab (always visible as default) */}
            {(!['instructions', 'resources', 'scripts'].some(t => expandedSkills.has(`${key}:tab:${t}`)) || expandedSkills.has(`${key}:tab:info`)) && (
              <>
                <div>
                  <label className="text-[10px] font-medium text-text-tertiary mb-1 block">{ag.skillNameLabel}</label>
                  <input className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={ag.skillNamePlaceholder} value={skill.name} onChange={e => updateSkill(path, 'name', e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-text-tertiary mb-1 block">{ag.descLabel}</label>
                  <input className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={ag.descPlaceholder} value={skill.description} onChange={e => updateSkill(path, 'description', e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-text-tertiary mb-1 block">{ag.allowedTools}</label>
                  <input className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={ag.allowedToolsPlaceholder}
                    value={(skill.allowed_tools || []).join(', ')} onChange={e => updateSkill(path, 'allowed_tools', e.target.value)} />
                </div>
              </>
            )}

            {/* Instructions tab */}
            {expandedSkills.has(`${key}:tab:instructions`) && (
              <div>
                <label className="text-[10px] font-semibold text-brand-400 uppercase mb-1 block flex items-center gap-1">
                  <FileText size={10} /> {ag.detailedInstructions}
                </label>
                <textarea rows={6} className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted font-mono resize-y"
                  placeholder={ag.instructionsPlaceholder}
                  value={skill.instructions || ''} onChange={e => updateSkill(path, 'instructions', e.target.value)} />
              </div>
            )}

            {/* Resources tab */}
            {expandedSkills.has(`${key}:tab:resources`) && (
              <>
                <div>
                  <label className="text-[10px] font-semibold text-emerald-400 uppercase mb-1 block flex items-center gap-1">
                    <BookOpen size={10} /> {ag.referenceDocs}
                  </label>
                  <textarea rows={3} className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted font-mono resize-y"
                    placeholder={ag.referenceDocsPlaceholder}
                    value={skill.references || ''} onChange={e => updateSkill(path, 'references', e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-emerald-400 uppercase mb-1 block flex items-center gap-1">
                    <BookOpen size={10} /> {ag.usageExamples}
                  </label>
                  <textarea rows={3} className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted font-mono resize-y"
                    placeholder={ag.usageExamplesPlaceholder}
                    value={skill.examples || ''} onChange={e => updateSkill(path, 'examples', e.target.value)} />
                </div>
              </>
            )}

            {/* Scripts tab */}
            {expandedSkills.has(`${key}:tab:scripts`) && (
              <div>
                <label className="text-[10px] font-semibold text-amber-400 uppercase mb-1 block flex items-center gap-1">
                  <Code size={10} /> {ag.scriptsLabel}
                </label>
                <p className="text-[10px] text-text-muted mb-2">{ag.scriptsDesc}</p>
                <textarea rows={4} className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[11px] outline-none focus:border-brand-500 placeholder:text-text-muted font-mono resize-y"
                  placeholder="# Python script\ndef run():\n    pass"
                  value={skill.scripts?.map(s => `# ${s.name} (${s.language})\n${s.content}`).join('\n\n') || ''}
                  readOnly />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Children (recursive) */}
      {isExpanded && isFolder && skill.children && skill.children.map((child, ci) => (
        <SkillTreeNode
          key={`${key}-${ci}`}
          skill={child}
          path={[...path, ci]}
          depth={depth + 1}
          expandedSkills={expandedSkills}
          editingSkill={editingSkill}
          toggleExpand={toggleExpand}
          setEditingSkill={setEditingSkill}
          updateSkill={updateSkill}
          removeSkill={removeSkill}
          addSkill={addSkill}
          addFolder={addFolder}
          duplicateSkill={duplicateSkill}
          ag={ag}
        />
      ))}
    </div>
  )
}

const AGENT_TYPES = [
  { value: 'http', label: 'HTTP API' },
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'knot', label: 'Knot AG-UI' },
]

const KNOT_AUTH_MODES_ZH = [
  { value: 'api_token', label: '智能体 Token（x-knot-token）' },
  { value: 'personal_token', label: '个人 Token（x-knot-api-token）' },
]

const KNOT_AUTH_MODES_EN = [
  { value: 'api_token', label: 'Agent Token (x-knot-token)' },
  { value: 'personal_token', label: 'Personal Token (x-knot-api-token)' },
]

const KNOT_MODELS = ['deepseek-v3.1', 'deepseek-v3.2', 'glm-4.7', 'claude-4.5-sonnet', 'hunyuan-2.0-thinking', 'hunyuan-2.0-instruct']

const defaultForm = {
  name: '', description: '', agent_type: 'http',
  system_prompt: '', skills: [] as Skill[],
  mcp_config: '',
  agent_config_url: '', agent_config_api_key: '', agent_config_model: '',
  http_method: 'POST',
  http_request_template: '{"message": "{{input}}"}',
  http_response_path: '',
  http_timeout: '60',
  http_headers: '',
  knot_agent_id: '', knot_auth_mode: 'api_token' as string,
  knot_api_token: '', knot_personal_token: '', knot_username: '',
  knot_workspace_uuid: '', knot_model: 'deepseek-v3.1',
}

export default function AgentsPage({ agents, onRefresh, showToast }: Props) {
  const { t, locale } = useI18n()
  const ag = t.agents as Record<string, string>
  const KNOT_AUTH_MODES = locale === 'zh' ? KNOT_AUTH_MODES_ZH : KNOT_AUTH_MODES_EN
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [testing, setTesting] = useState<string | null>(null)
  const [guideAgent, setGuideAgent] = useState<Agent | null>(null)

  const openCreate = () => { setForm(defaultForm); setEditId(null); setShowModal(true) }
  const openEdit = (a: Agent) => {
    const config = (a.agent_config || {}) as Record<string, unknown>
    setForm({
      name: a.name, description: a.description || '', agent_type: a.agent_type,
      system_prompt: a.system_prompt || '',
      skills: (a.skills || []) as Skill[],
      mcp_config: a.mcp_config ? JSON.stringify(a.mcp_config, null, 2) : '',
      agent_config_url: (config.url as string) || (config.base_url as string) || '',
      agent_config_api_key: (config.api_key as string) || '',
      agent_config_model: (config.model as string) || '',
      http_method: (config.method as string) || 'POST',
      http_request_template: config.request_template ? (typeof config.request_template === 'string' ? config.request_template : JSON.stringify(config.request_template, null, 2)) : '{"message": "{{input}}"}',
      http_response_path: (config.response_path as string) || '',
      http_timeout: config.timeout ? String(config.timeout) : '60',
      http_headers: config.headers ? JSON.stringify(config.headers, null, 2) : '',
      knot_agent_id: (config.agent_id as string) || '',
      knot_auth_mode: config.personal_token ? 'personal_token' : 'api_token',
      knot_api_token: (config.api_token as string) || '',
      knot_personal_token: (config.personal_token as string) || '',
      knot_username: (config.username as string) || '',
      knot_workspace_uuid: (config.workspace_uuid as string) || '',
      knot_model: (config.model as string) || 'deepseek-v3.1',
    })
    setEditId(a.id); setShowModal(true)
  }

  const addSkill = (parentPath?: number[]) => {
    const newSkill: Skill = { name: '', description: '' }
    if (!parentPath || parentPath.length === 0) {
      setForm({ ...form, skills: [...form.skills, newSkill] })
    } else {
      const skills = JSON.parse(JSON.stringify(form.skills)) as Skill[]
      let target = skills[parentPath[0]]
      for (let i = 1; i < parentPath.length; i++) target = target.children![parentPath[i]]
      if (!target.children) target.children = []
      target.children.push(newSkill)
      setForm({ ...form, skills })
    }
  }
  const removeSkill = (path: number[]) => {
    const skills = JSON.parse(JSON.stringify(form.skills)) as Skill[]
    if (path.length === 1) {
      skills.splice(path[0], 1)
    } else {
      let parent = skills[path[0]]
      for (let i = 1; i < path.length - 1; i++) parent = parent.children![path[i]]
      parent.children!.splice(path[path.length - 1], 1)
      if (parent.children!.length === 0) delete parent.children
    }
    setForm({ ...form, skills })
  }
  const updateSkill = (path: number[], field: keyof Skill, val: string) => {
    const skills = JSON.parse(JSON.stringify(form.skills)) as Skill[]
    let target = skills[path[0]]
    for (let i = 1; i < path.length; i++) target = target.children![path[i]]
    if (field === 'allowed_tools') {
      (target as unknown as Record<string, unknown>)[field] = val ? val.split(',').map(s => s.trim()).filter(Boolean) : null
    } else if (field === 'name' || field === 'description') {
      (target as unknown as Record<string, unknown>)[field] = val
    } else {
      (target as unknown as Record<string, unknown>)[field] = val || null
    }
    setForm({ ...form, skills })
  }
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set())
  const [editingSkill, setEditingSkill] = useState<string | null>(null)
  const toggleSkillExpand = (key: string) => {
    const s = new Set(expandedSkills)
    s.has(key) ? s.delete(key) : s.add(key)
    setExpandedSkills(s)
  }
  const addFolder = (parentPath?: number[]) => {
    const newFolder: Skill = { name: '', description: '', children: [] }
    if (!parentPath || parentPath.length === 0) {
      setForm({ ...form, skills: [...form.skills, newFolder] })
    } else {
      const skills = JSON.parse(JSON.stringify(form.skills)) as Skill[]
      let target = skills[parentPath[0]]
      for (let i = 1; i < parentPath.length; i++) target = target.children![parentPath[i]]
      if (!target.children) target.children = []
      target.children.push(newFolder)
      setForm({ ...form, skills })
    }
  }
  const duplicateSkill = (path: number[]) => {
    const skills = JSON.parse(JSON.stringify(form.skills)) as Skill[]
    if (path.length === 1) {
      const clone = JSON.parse(JSON.stringify(skills[path[0]])) as Skill
      clone.name = clone.name ? `${clone.name} (${ag.copyLabel})` : ''
      skills.splice(path[0] + 1, 0, clone)
    } else {
      let parent = skills[path[0]]
      for (let i = 1; i < path.length - 1; i++) parent = parent.children![path[i]]
      const idx = path[path.length - 1]
      const clone = JSON.parse(JSON.stringify(parent.children![idx])) as Skill
      clone.name = clone.name ? `${clone.name} (${ag.copyLabel})` : ''
      parent.children!.splice(idx + 1, 0, clone)
    }
    setForm({ ...form, skills })
  }
  const countSkills = (skills: Skill[]): { folders: number; files: number } => {
    let folders = 0, files = 0
    for (const s of skills) {
      if (s.children !== undefined) {
        folders++
        if (s.children.length > 0) {
          const sub = countSkills(s.children)
          folders += sub.folders; files += sub.files
        }
      } else {
        files++
      }
    }
    return { folders, files }
  }

  const handleSave = async () => {
    try {
      let agentConfig: Record<string, unknown> = {}

      if (form.agent_type === 'knot') {
        if (!form.knot_agent_id) { showToast(ag.fillAgentId, 'error'); return }
        agentConfig.agent_id = form.knot_agent_id
        if (form.knot_auth_mode === 'personal_token') {
          if (!form.knot_personal_token) { showToast(ag.fillPersonalToken, 'error'); return }
          agentConfig.personal_token = form.knot_personal_token
        } else {
          if (!form.knot_api_token) { showToast(ag.fillAgentToken, 'error'); return }
          agentConfig.api_token = form.knot_api_token
          if (form.knot_username) agentConfig.username = form.knot_username
        }
        if (form.knot_workspace_uuid) agentConfig.workspace_uuid = form.knot_workspace_uuid
        agentConfig.model = form.knot_model
      } else if (form.agent_type === 'http') {
        if (!form.agent_config_url) { showToast(ag.fillApiUrl, 'error'); return }
        agentConfig.url = form.agent_config_url
        agentConfig.method = form.http_method || 'POST'
        agentConfig.timeout = parseInt(form.http_timeout) || 60

        if (form.http_request_template.trim()) {
          try {
            agentConfig.request_template = JSON.parse(form.http_request_template)
          } catch {
            showToast(ag.requestTemplateJsonError, 'error'); return
          }
        }
        if (form.http_headers.trim()) {
          try {
            agentConfig.headers = JSON.parse(form.http_headers)
          } catch {
            showToast(ag.headersJsonError, 'error'); return
          }
        }
        if (form.http_response_path.trim()) {
          agentConfig.response_path = form.http_response_path.trim()
        }
      } else {
        if (form.agent_config_url) agentConfig.url = form.agent_config_url
        if (form.agent_config_api_key) agentConfig.api_key = form.agent_config_api_key
        if (form.agent_config_model) agentConfig.model = form.agent_config_model
        agentConfig.base_url = form.agent_config_url
      }

      let mcpConfig = null
      if (form.mcp_config.trim()) {
        try { mcpConfig = JSON.parse(form.mcp_config) } catch { showToast(ag.mcpConfigJsonError, 'error'); return }
      }

      const payload = {
        name: form.name, description: form.description, agent_type: form.agent_type,
        system_prompt: form.system_prompt || null,
        skills: form.skills.length > 0 ? form.skills : null,
        mcp_config: mcpConfig,
        agent_config: Object.keys(agentConfig).length > 0 ? agentConfig : null,
      }
      if (editId) await updateAgent(editId, payload)
      else await createAgent(payload)
      showToast(editId ? ag.updated : ag.created, 'success'); setShowModal(false); onRefresh()
    } catch (e: unknown) {
      showToast(`${ag.operationFailed}: ${e instanceof Error ? e.message : ag.unknownError}`, 'error')
    }
  }

  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmDelId !== id) { setConfirmDelId(id); setTimeout(() => setConfirmDelId(p => p === id ? null : p), 3000); return }
    try { await deleteAgent(id); showToast(ag.deleted); setConfirmDelId(null); onRefresh() } catch (e: unknown) { showToast(`${ag.deleteFailed}: ${e instanceof Error ? e.message : ag.unknownError}`, 'error'); setConfirmDelId(null) }
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    try {
      const res = await testAgent(id)
      if (res.success) showToast(`${ag.connectSuccess} (${res.latency_ms}ms)`, 'success')
      else showToast(`${ag.connectFailed}: ${res.error}`, 'error')
    } catch (e: unknown) { showToast(`${ag.testError}: ${e instanceof Error ? e.message : ag.unknownError}`, 'error') }
    setTesting(null)
  }

  const parseKnotUrl = (url: string) => {
    const match = url.match(/agents\/agui\/([a-f0-9]+)/)
    if (match) {
      setForm(f => ({ ...f, knot_agent_id: match[1] }))
      showToast(ag.extractedAgentId, 'success')
    }
  }

  const inputCls = "w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted"

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Users size={20} /> {ag.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{ag.desc}</p>
        </div>
        <Button onClick={openCreate}><Plus size={14} className="mr-1" />{ag.registerAgent}</Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState icon={<Users size={36} className="text-text-muted" />} title={ag.noAgents} description={ag.noAgentsHint} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead><tr className="border-b border-border text-[11px] text-text-tertiary uppercase">
              <th className="px-4 py-2.5">{ag.name}</th><th className="px-4 py-2.5">{ag.type}</th><th className="px-4 py-2.5">{ag.skills}</th><th className="px-4 py-2.5">{ag.description}</th><th className="px-4 py-2.5">{ag.actions}</th>
            </tr></thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-surface-3/30 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-text-primary font-medium">{a.name}</td>
                  <td className="px-4 py-3"><Badge variant={a.agent_type === 'openai' ? 'blue' : a.agent_type === 'knot' ? 'purple' : 'gray'}>{AGENT_TYPES.find(t => t.value === a.agent_type)?.label || a.agent_type}</Badge></td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{a.skills ? `${a.skills.length} ${ag.skillsCount}` : '-'}</td>
                  <td className="px-4 py-3 text-xs text-text-tertiary max-w-[200px] truncate">{a.description || '-'}</td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <button onClick={() => handleTest(a.id)} disabled={testing === a.id} className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50">
                      {testing === a.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} {ag.test}
                    </button>
                    <button onClick={() => setGuideAgent(a)} className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                      <Radio size={12} /> {ag.monitor}
                    </button>
                    <button onClick={() => openEdit(a)} className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"><Edit2 size={12} /> {ag.edit}</button>
                    <button onClick={() => handleDelete(a.id)} className={`text-[11px] flex items-center gap-1 transition-colors ${confirmDelId === a.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded' : 'text-red-500 hover:text-red-400'}`}><Trash2 size={12} /> {confirmDelId === a.id ? ag.confirmDelete : ag.delete}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? ag.editLabel : ag.registerLabel} Agent</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.name}</label><input className={inputCls} placeholder={ag.agentNamePlaceholder} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.accessType}</label><select className={inputCls} value={form.agent_type} onChange={e => setForm({ ...form, agent_type: e.target.value })}>{AGENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.description}</label><input className={inputCls} placeholder={ag.agentDescPlaceholder} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>

          {/* Knot Config */}
          {form.agent_type === 'knot' && (
            <div className="divider pt-3 mt-1">
              <span className="text-xs font-semibold text-brand-400">{ag.knotConfig}</span>
              <div className="grid gap-3 mt-2">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.agentId} <span className="text-text-muted">({ag.agentIdHint})</span></label>
                  <input className={inputCls} placeholder={ag.agentIdPlaceholder} value={form.knot_agent_id}
                    onChange={e => {
                      const v = e.target.value
                      setForm({ ...form, knot_agent_id: v })
                      const m = v.match(/agents\/agui\/([a-f0-9]+)/)
                      if (m) setTimeout(() => parseKnotUrl(v), 100)
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.authMode}</label>
                  <select className={inputCls} value={form.knot_auth_mode} onChange={e => setForm({ ...form, knot_auth_mode: e.target.value })}>
                    {KNOT_AUTH_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {form.knot_auth_mode === 'api_token' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.agentApiKey}</label><PasswordInput placeholder="knot_xxx" value={form.knot_api_token} onChange={v => setForm({ ...form, knot_api_token: v })} /></div>
                    <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.username} <span className="text-text-muted">(X-Username)</span></label><input className={inputCls} placeholder="your-rtx" value={form.knot_username} onChange={e => setForm({ ...form, knot_username: e.target.value })} /></div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.personalToken} <span className="text-text-muted">({ag.personalTokenHint})</span></label>
                    <PasswordInput placeholder={ag.personalTokenPlaceholder} value={form.knot_personal_token} onChange={v => setForm({ ...form, knot_personal_token: v })} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.model}</label>
                    <select className={inputCls} value={form.knot_model} onChange={e => setForm({ ...form, knot_model: e.target.value })}>
                      {KNOT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.workspaceUuid} <span className="text-text-muted">({ag.workspaceUuidOptional})</span></label>
                    <input className={inputCls} placeholder="831fa26a-4daf-42d7-..." value={form.knot_workspace_uuid} onChange={e => setForm({ ...form, knot_workspace_uuid: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HTTP / OpenAI Config */}
          {form.agent_type !== 'knot' && (
            <div className="divider pt-3 mt-1">
              <span className="text-xs font-semibold text-text-secondary">{ag.accessConfig}</span>
              <div className="grid gap-3 mt-2">
                <div><label className="text-xs font-medium text-text-secondary mb-1 block">{form.agent_type === 'openai' ? 'Base URL' : 'API URL'}</label><input className={inputCls} placeholder="http://..." value={form.agent_config_url} onChange={e => setForm({ ...form, agent_config_url: e.target.value })} /></div>
                {form.agent_type === 'openai' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-medium text-text-secondary mb-1 block">API Key</label><PasswordInput value={form.agent_config_api_key} onChange={v => setForm({ ...form, agent_config_api_key: v })} /></div>
                    <div><label className="text-xs font-medium text-text-secondary mb-1 block">Model</label><input className={inputCls} value={form.agent_config_model} onChange={e => setForm({ ...form, agent_config_model: e.target.value })} /></div>
                  </div>
                )}
                {form.agent_type === 'http' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.httpMethod}</label>
                        <select className={inputCls} value={form.http_method} onChange={e => setForm({ ...form, http_method: e.target.value })}>
                          <option value="POST">POST</option>
                          <option value="GET">GET</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.timeoutSeconds}</label>
                        <input className={inputCls} type="number" min="1" max="600" placeholder="60" value={form.http_timeout} onChange={e => setForm({ ...form, http_timeout: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1 block">
                        {ag.requestTemplate} <span className="text-text-muted">({ag.requestTemplateHint})</span>
                      </label>
                      <textarea rows={3} className={inputCls + " font-mono resize-y"} placeholder='{"message": "{{input}}"}' value={form.http_request_template} onChange={e => setForm({ ...form, http_request_template: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1 block">
                        {ag.responsePath} <span className="text-text-muted">({ag.responsePathHint})</span>
                      </label>
                      <input className={inputCls} placeholder={ag.responsePathPlaceholder} value={form.http_response_path} onChange={e => setForm({ ...form, http_response_path: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1 block">
                        {ag.customHeaders} <span className="text-text-muted">({ag.customHeadersHint})</span>
                      </label>
                      <textarea rows={2} className={inputCls + " font-mono resize-y"} placeholder='{"Authorization": "Bearer xxx"}' value={form.http_headers} onChange={e => setForm({ ...form, http_headers: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* System Prompt */}
          <div className="divider pt-3 mt-1">
            <span className="text-xs font-semibold text-text-secondary">{ag.agentMeta}</span>
            <div className="mt-2"><label className="text-xs font-medium text-text-secondary mb-1 block">{ag.systemPrompt}</label><textarea rows={4} className={inputCls + " resize-y"} placeholder={ag.systemPromptPlaceholder} value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} /></div>
          </div>

          {/* Skills Tree */}
          <div className="divider pt-3 mt-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Folder size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-text-secondary">{ag.skillsTree}</span>
                {form.skills.length > 0 && (
                  <span className="text-[10px] text-text-muted bg-surface-3/50 px-1.5 py-0.5 rounded">
                    {(() => { const c = countSkills(form.skills); return `${c.folders} ${ag.folders} · ${c.files} ${ag.skillsLabel}` })()}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => addFolder()} className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-amber-400/10 transition-colors"><FolderPlus size={12} /> {ag.folder}</button>
                <button onClick={() => addSkill()} className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-brand-400/10 transition-colors"><Plus size={12} /> {ag.skill}</button>
              </div>
            </div>
            {form.skills.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <Folder size={24} className="text-text-muted mx-auto mb-2" />
                <p className="text-text-muted text-xs">{ag.noSkillsTree}</p>
                <p className="text-border text-[10px] mt-1">{ag.noSkillsTreeHint}</p>
              </div>
            ) : (
              <div className="bg-surface-0/50 border border-border/50 rounded-lg py-1 max-h-[300px] overflow-y-auto">
                {form.skills.map((s, i) => (
                  <SkillTreeNode
                    key={i}
                    skill={s}
                    path={[i]}
                    depth={0}
                    expandedSkills={expandedSkills}
                    editingSkill={editingSkill}
                    toggleExpand={toggleSkillExpand}
                    setEditingSkill={setEditingSkill}
                    updateSkill={updateSkill}
                    removeSkill={removeSkill}
                    addSkill={addSkill}
                    addFolder={addFolder}
                    duplicateSkill={duplicateSkill}
                    ag={ag}
                  />
                ))}
              </div>
            )}
          </div>

          {/* MCP Config */}
          <div className="divider pt-3 mt-1">
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ag.mcpConfigLabel} <span className="text-text-muted">({ag.mcpConfigHint})</span></label>
            <textarea rows={3} className={inputCls + " font-mono resize-y"} placeholder='{"mcp_servers": [...]}' value={form.mcp_config} onChange={e => setForm({ ...form, mcp_config: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{ag.cancel}</Button>
          <Button onClick={handleSave}>{editId ? ag.save : ag.create}</Button>
        </div>
      </Modal>

      {/* Monitoring Guide Modal */}
      <Modal open={!!guideAgent} onClose={() => setGuideAgent(null)}>
        {guideAgent && (
          <IntegrationGuide agent={guideAgent} onClose={() => setGuideAgent(null)} ag={ag} />
        )}
      </Modal>
    </div>
  )
}

// ===== Integration Guide Component =====
function IntegrationGuide({ agent, onClose, ag }: { agent: Agent; onClose: () => void; ag: Record<string, string> }) {
  const [tab, setTab] = useState<'rest' | 'sdk' | 'otel'>('rest')
  const agentUrl = (agent.agent_config as Record<string, string>)?.url || 'http://your-agent-api'
  const baseUrl = window.location.origin

  const tabs = [
    { key: 'rest' as const, label: ag.restApiTab, desc: ag.restApiDesc },
    { key: 'sdk' as const, label: ag.sdkTab, desc: ag.sdkDesc },
    { key: 'otel' as const, label: ag.otelTab, desc: ag.otelDesc },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Code size={16} className="text-emerald-400" /> {ag.integrationGuide} — {agent.name}
        </h3>
        <p className="text-xs text-text-tertiary mt-1">
          Agent ID: <code className="text-amber-400/80 bg-surface-3/50 px-1 rounded">{agent.id}</code>
        </p>
      </div>

      <div className="flex gap-1 bg-surface-2/50 p-1 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-[11px] px-3 py-2 rounded-md transition-all ${
              tab === t.key
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-text-tertiary hover:text-text-secondary border border-transparent'
            }`}
          >
            <div className="font-medium">{t.label}</div>
          </button>
        ))}
      </div>

      {/* REST API Tab */}
      {tab === 'rest' && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">{ag.restIntro}</p>

          <div className="text-[11px] text-text-tertiary font-medium">{ag.restSceneCurl}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`curl -X POST ${baseUrl}/api/v2/traces \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "user-query",
    "agent_id": "${agent.id}",
    "input": "Hello",
    "output": "Hi there!",
    "latency_ms": 1200
  }'`}
          </pre>

          <div className="text-[11px] text-text-tertiary font-medium mt-4">{ag.restScenePython}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`import requests, time

# 1. Call your Agent HTTP API
start = time.time()
resp = requests.post("${agentUrl}", json={
    "message": user_input
})
latency_ms = int((time.time() - start) * 1000)
result = resp.json()

# 2. Report to eval platform
requests.post("${baseUrl}/api/v2/traces", json={
    "name": "${agent.name}",
    "agent_id": "${agent.id}",
    "input": user_input,
    "output": result.get("answer", str(result)),
    "latency_ms": latency_ms,
    "metadata": {"raw_response": result}
})`}
          </pre>

          <div className="text-[11px] text-text-tertiary font-medium mt-4">{ag.restSceneGeneration}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`curl -X POST ${baseUrl}/api/v2/generations \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "chat",
    "agent_id": "${agent.id}",
    "model": "gpt-4",
    "input": [{"role": "user", "content": "hello"}],
    "output": "Hi there!",
    "token_usage": {"prompt_tokens": 10, "completion_tokens": 5}
  }'`}
          </pre>

          <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-3 mt-2">
            <div className="text-[11px] text-blue-300">
              {ag.fullApiDoc}: <a href="/docs" target="_blank" className="underline hover:text-blue-200">{ag.openSwagger}</a>
            </div>
          </div>
        </div>
      )}

      {/* SDK Tab */}
      {tab === 'sdk' && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">{ag.sdkIntro}</p>

          <div className="text-[11px] text-text-tertiary font-medium">{ag.sdkInstall}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary overflow-x-auto whitespace-pre">
{`pip install agent-eval-sdk`}
          </pre>

          <div className="text-[11px] text-text-tertiary font-medium mt-3">{ag.sdkDecorator}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`from agent_eval import AgentEval

ae = AgentEval(
    base_url="${baseUrl}",
    agent_id="${agent.id}",
)

@ae.observe()
def handle_query(query: str) -> str:
    result = my_agent.run(query)
    return result`}
          </pre>

          <div className="text-[11px] text-text-tertiary font-medium mt-3">{ag.sdkContextManager}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`with ae.trace(name="customer-support") as trace:
    trace.set_input(query)
    result = my_agent.run(query)
    trace.set_output(result)
    trace.score(name="quality", value=0.9)`}
          </pre>
        </div>
      )}

      {/* OTel Tab */}
      {tab === 'otel' && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">{ag.otelIntro}</p>

          <div className="text-[11px] text-text-tertiary font-medium">{ag.otelEnvConfig}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`export OTEL_EXPORTER_OTLP_ENDPOINT="${baseUrl}/api"
export OTEL_RESOURCE_ATTRIBUTES="agent.id=${agent.id}"`}
          </pre>

          <div className="text-[11px] text-text-tertiary font-medium mt-3">{ag.otelManualConfig}</div>
          <pre className="bg-surface-0 border border-border rounded-lg p-4 text-[11px] text-text-secondary leading-relaxed overflow-x-auto whitespace-pre">
{`from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

resource = Resource.create({
    "service.name": "${agent.name}",
    "agent.id": "${agent.id}",
})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(
    OTLPSpanExporter(endpoint="${baseUrl}/api/v1/traces")
))
trace.set_tracer_provider(provider)`}
          </pre>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={onClose} className="text-xs">{ag.close}</Button>
      </div>
    </div>
  )
}
