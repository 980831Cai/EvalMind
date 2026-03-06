import { useState } from 'react'
import { FileText, ArrowRight, CheckCircle } from 'lucide-react'
import type { TestSuite } from '../types'
import * as api from '../services/api'
import Button from './ui/Button'
import Modal from './ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  traceIds: string[]
  suites: TestSuite[]
  showToast: (msg: string, type?: 'success' | 'error') => void
  onSuccess?: () => void
}

export default function TraceToTestCase({ open, onClose, traceIds, suites, showToast, onSuccess }: Props) {
  const [suiteId, setSuiteId] = useState('')
  const [includeExpected, setIncludeExpected] = useState(true)
  const [includeTrajectory, setIncludeTrajectory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; total_cases: number } | null>(null)

  const handleImport = async () => {
    if (!suiteId || traceIds.length === 0) return
    setLoading(true)
    try {
      const resp = await api.batchImportTraces({
        trace_ids: traceIds,
        suite_id: suiteId,
        include_expected_output: includeExpected,
        include_trajectory: includeTrajectory,
      })
      setResult(resp)
      showToast(`成功导入 ${resp.imported} 条测试用例`)
      onSuccess?.()
    } catch (e: unknown) {
      showToast(`导入失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    setSuiteId('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Trace → 测试用例" size="sm">

      {result ? (
        <div className="text-center py-6">
          <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-text-primary mb-1">导入成功</p>
          <p className="text-xs text-text-tertiary">已导入 {result.imported} 条，套件共 {result.total_cases} 条用例</p>
          <Button onClick={handleClose} className="mt-4">关闭</Button>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-xs text-text-secondary mb-2">
              已选择 <span className="text-brand-400 font-semibold">{traceIds.length}</span> 条 Trace
            </div>
            <div className="flex items-center gap-2 text-text-tertiary text-xs">
              <span>{traceIds.length} Traces</span>
              <ArrowRight size={12} />
              <span>TestSuite</span>
            </div>
          </div>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">目标测试套件</label>
              <select
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500"
                value={suiteId}
                onChange={e => setSuiteId(e.target.value)}
              >
                <option value="">-- 选择测试套件 --</option>
                {suites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.case_count} 条)</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeExpected} onChange={e => setIncludeExpected(e.target.checked)} className="accent-brand-500" />
                <span className="text-xs text-text-secondary">包含 expected_output</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeTrajectory} onChange={e => setIncludeTrajectory(e.target.checked)} className="accent-violet-500" />
                <span className="text-xs text-text-secondary">包含工具轨迹</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="ghost" onClick={handleClose}>取消</Button>
            <Button onClick={handleImport} disabled={!suiteId || loading}>
              {loading ? '导入中...' : `导入 ${traceIds.length} 条`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
