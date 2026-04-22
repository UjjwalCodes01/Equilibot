'use client'

import { useAuditLog } from '@/hooks/use-telemetry'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import type { AuditStage } from '@/lib/api/types'

const STAGE_BADGE: Record<AuditStage, string> = {
  OPPORTUNITY: 'badge-observe',
  INTENT: 'badge-calculate',
  POLICY: 'badge-verify',
  SIMULATION: 'badge-verify',
  EXECUTION: 'badge-execute',
  SKIP: 'badge-skip',
}

const STAGE_LABELS: Record<AuditStage, string> = {
  OPPORTUNITY: 'OBSERVE',
  INTENT: 'CALCULATE',
  POLICY: 'VERIFY',
  SIMULATION: 'SIMULATE',
  EXECUTION: 'EXECUTE',
  SKIP: 'SKIP',
}

export function ThoughtLog() {
  const { data } = useAuditLog()
  const scrollRef = useRef<HTMLDivElement>(null)
  const entries = data?.entries?.slice().reverse() ?? []
  const [narrations, setNarrations] = useState<Map<string, { loading: boolean; text: string | null }>>(new Map())

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [entries.length])

  const handleNarrate = useCallback(async (key: string, stage: AuditStage, pair: string | null, entryData: Record<string, unknown>) => {
    // Already cached — don't re-fetch
    if (narrations.has(key)) return

    setNarrations((prev) => new Map(prev).set(key, { loading: true, text: null }))

    try {
      const res = await fetch('/api/ai/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, pair, data: entryData }),
      })
      const json = await res.json()
      setNarrations((prev) => new Map(prev).set(key, { loading: false, text: json.narration ?? 'Unable to narrate this event.' }))
    } catch {
      setNarrations((prev) => new Map(prev).set(key, { loading: false, text: 'AI narration unavailable.' }))
    }
  }, [narrations])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-mist text-sm">
          <div className="w-10 h-10 rounded-full bg-glass-hover flex items-center justify-center mb-3 animate-pulse">
            <span className="text-lg">🤖</span>
          </div>
          <p>Waiting for agent activity…</p>
          <p className="text-xs mt-1 text-mist/60">Connect the agent to see the thought stream</p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => {
          const badgeClass = STAGE_BADGE[entry.stage] || 'badge-skip'
          const stageLabel = STAGE_LABELS[entry.stage] || entry.stage
          const summary = buildSummary(entry.stage, entry.data)
          const entryKey = `${entry.timestamp}-${i}`
          const narration = narrations.get(entryKey)

          return (
            <motion.div
              key={entryKey}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-3 group"
            >
              {/* Timeline dot */}
              <div className="flex flex-col items-center pt-1.5">
                <div className={cn('w-2 h-2 rounded-full shrink-0', {
                  'bg-indigo-glow': entry.stage === 'OPPORTUNITY',
                  'bg-amber-glow': entry.stage === 'INTENT',
                  'bg-cyan-glow': entry.stage === 'POLICY' || entry.stage === 'SIMULATION',
                  'bg-emerald-glow': entry.stage === 'EXECUTION',
                  'bg-mist': entry.stage === 'SKIP',
                })} />
                <div className="w-px flex-1 bg-glass-border mt-1" />
              </div>

              {/* Content */}
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', badgeClass)}>
                    {stageLabel}
                  </span>
                  {entry.pair && (
                    <span className="text-[10px] text-mist font-mono">{entry.pair}</span>
                  )}
                  <span className="text-[10px] text-mist/50 ml-auto">
                    {timeAgo(new Date(entry.timestamp).getTime())}
                  </span>
                </div>
                <p className="text-xs text-arctic/80 leading-relaxed">{summary}</p>

                {/* AI Narration */}
                {!narration && (
                  <button
                    onClick={() => handleNarrate(entryKey, entry.stage, entry.pair ?? null, entry.data)}
                    className="mt-1.5 flex items-center gap-1 text-[10px] text-gold-400/70 hover:text-gold-400 transition-colors"
                    id={`narrate-${i}`}
                  >
                    <Sparkles className="w-3 h-3" />
                    AI Insight
                  </button>
                )}
                {narration?.loading && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-mist/60">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Thinking…
                  </div>
                )}
                {narration?.text && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 px-3 py-2 rounded-lg bg-gold-500/5 border border-gold-500/15"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <Sparkles className="w-3 h-3 text-gold-400" />
                      <span className="text-[10px] font-semibold text-gold-400">AI Insight</span>
                    </div>
                    <p className="text-[11px] text-arctic/70 leading-relaxed">{narration.text}</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function buildSummary(stage: AuditStage, data: Record<string, unknown>): string {
  switch (stage) {
    case 'OPPORTUNITY':
      return `Deviation ${data.deviationBps ?? '?'}bps detected — direction: ${data.direction ?? '?'}`
    case 'INTENT':
      return `Intent built: ${data.direction ?? '?'} | Amount: ${data.amountIn ?? '?'} | Min out: ${data.minAmountOut ?? '?'}`
    case 'POLICY':
      return data.passed ? '✅ Policy checks passed' : `❌ Policy rejected: ${data.error ?? 'unknown reason'}`
    case 'SIMULATION':
      return data.success
        ? `✅ Simulation passed — gas: ${data.gasUsed ?? '?'}`
        : `❌ Simulation failed: ${data.revertReason ?? 'unknown'}`
    case 'EXECUTION':
      return data.status === 'EXECUTED'
        ? `🚀 Executed — tx: ${String(data.txHash ?? '').slice(0, 18)}…`
        : `⚠️ ${data.status}: ${data.rejectReason ?? ''}`
    case 'SKIP':
      return `Skipped: ${data.reason ?? 'no reason provided'}`
    default:
      return JSON.stringify(data).slice(0, 120)
  }
}
