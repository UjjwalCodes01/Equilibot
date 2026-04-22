'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useAuditLog } from '@/hooks/use-telemetry'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, Download, Filter, ChevronDown, ChevronRight, ExternalLink, Sparkles, Loader2 } from 'lucide-react'
import type { AuditStage } from '@/lib/api/types'
import { EXPLORER_TX_URL } from '@/lib/contracts/config'

const STAGE_STYLES: Record<AuditStage, { badge: string; dot: string }> = {
  OPPORTUNITY: { badge: 'badge-observe', dot: 'bg-indigo-glow' },
  INTENT: { badge: 'badge-calculate', dot: 'bg-amber-glow' },
  POLICY: { badge: 'badge-verify', dot: 'bg-cyan-glow' },
  SIMULATION: { badge: 'badge-verify', dot: 'bg-cyan-glow' },
  EXECUTION: { badge: 'badge-execute', dot: 'bg-emerald-glow' },
  SKIP: { badge: 'badge-skip', dot: 'bg-mist' },
}

const ALL_STAGES: AuditStage[] = ['OPPORTUNITY', 'INTENT', 'POLICY', 'SIMULATION', 'EXECUTION', 'SKIP']

export default function AuditsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]!)
  const [stageFilter, setStageFilter] = useState<AuditStage | 'ALL'>('ALL')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading } = useAuditLog(date)
  const [explanations, setExplanations] = useState<Map<string, { loading: boolean; text: string | null }>>(new Map())

  const entries = (data?.entries ?? []).filter(
    (e) => stageFilter === 'ALL' || e.stage === stageFilter
  )

  function handleExport() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `equilibot-audit-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExplain = useCallback(async (key: string, entry: { stage: string; pair: string | null; intentId: string | null; timestamp: string; data: Record<string, unknown> }) => {
    if (explanations.has(key)) return

    setExplanations((prev) => new Map(prev).set(key, { loading: true, text: null }))

    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry }),
      })
      const json = await res.json()
      setExplanations((prev) => new Map(prev).set(key, { loading: false, text: json.explanation ?? 'Unable to analyze this entry.' }))
    } catch {
      setExplanations((prev) => new Map(prev).set(key, { loading: false, text: 'AI analysis unavailable.' }))
    }
  }, [explanations])

  return (
    <>
      <Topbar title="Governance Audits" />
      <PageWrapper>
        {/* Controls */}
        <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-gold-500" />
            <span className="text-sm font-medium text-arctic">Proof of Intent Explorer</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-space-800 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-arctic outline-none"
              id="audit-date-picker"
            />

            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-mist" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as AuditStage | 'ALL')}
                className="bg-space-800 border border-glass-border rounded-lg px-2 py-1.5 text-xs text-arctic outline-none"
                id="audit-stage-filter"
              >
                <option value="ALL">All Stages</option>
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/10 text-gold-400 text-xs hover:bg-gold-500/20 transition-colors"
              id="audit-export-btn"
            >
              <Download className="w-3 h-3" /> Export
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-5 space-y-1">
          {isLoading && (
            <div className="glass-panel p-12 text-center text-mist text-sm animate-pulse">Loading audit entries…</div>
          )}

          {!isLoading && entries.length === 0 && (
            <div className="glass-panel p-12 text-center text-mist text-sm">
              <FileSearch className="w-8 h-8 mx-auto mb-3 text-mist/30" />
              <p>No audit entries for {date}</p>
              <p className="text-xs text-mist/50 mt-1">The agent logs every decision to the audit trail</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {entries.map((entry, i) => {
              const key = `${entry.timestamp}-${i}`
              const isOpen = expanded === key
              const style = STAGE_STYLES[entry.stage] || STAGE_STYLES.SKIP!
              const txHash = entry.data?.txHash as string | undefined
              const explanation = explanations.get(key)

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-panel-sm overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-glass-hover transition-colors text-left"
                    id={`audit-entry-${i}`}
                  >
                    <div className={cn('w-2 h-2 rounded-full shrink-0', style.dot)} />
                    <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0', style.badge)}>
                      {entry.stage}
                    </span>
                    <span className="text-xs text-mist font-mono shrink-0">{entry.pair || '—'}</span>
                    <span className="text-xs text-mist/50 truncate flex-1">
                      {entry.intentId ? `Intent: ${entry.intentId.slice(0, 12)}…` : ''}
                    </span>
                    <span className="text-[10px] text-mist/40 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    {txHash && (
                      <a
                        href={`${EXPLORER_TX_URL}${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold-500 hover:text-gold-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-mist shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-mist shrink-0" />}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-glass-border">
                          <pre className="text-xs text-mist/80 font-mono bg-space-950 rounded-lg p-3 overflow-x-auto max-h-[300px]">
                            {JSON.stringify(entry.data, null, 2)}
                          </pre>

                          {/* AI Explain Button */}
                          {!explanation && (
                            <button
                              onClick={() => handleExplain(key, {
                                stage: entry.stage,
                                pair: entry.pair ?? null,
                                intentId: entry.intentId ?? null,
                                timestamp: entry.timestamp,
                                data: entry.data,
                              })}
                              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/10 text-gold-400 text-xs hover:bg-gold-500/20 transition-colors"
                              id={`explain-${i}`}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Analyze with AI
                            </button>
                          )}
                          {explanation?.loading && (
                            <div className="mt-3 flex items-center gap-1.5 text-xs text-mist/60">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Analyzing decision…
                            </div>
                          )}
                          {explanation?.text && (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-3 px-4 py-3 rounded-lg bg-gold-500/5 border border-gold-500/15"
                            >
                              <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-gold-400" />
                                <span className="text-xs font-semibold text-gold-400">AI Analysis</span>
                              </div>
                              <p className="text-xs text-arctic/70 leading-relaxed">{explanation.text}</p>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {entries.length > 0 && (
            <div className="text-center py-3 text-[10px] text-mist/40">
              Showing {entries.length} of {data?.count ?? 0} entries
            </div>
          )}
        </div>
      </PageWrapper>
    </>
  )
}
