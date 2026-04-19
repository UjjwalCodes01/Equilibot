'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useTaskStatuses, useTaskProof, useAuditLog, useTriggerTask } from '@/hooks/use-telemetry'
import { formatDuration, timeAgo, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Sprout, Timer, TrendingUp, Coins, Play, Loader2, ArrowRight, Zap } from 'lucide-react'

export default function YieldPage() {
  const { data: statuses } = useTaskStatuses()
  const { data: proofData } = useTaskProof('yield-harvest-reinvest')
  const { data: audit } = useAuditLog()
  const { mutate: trigger, isPending } = useTriggerTask()

  const harvestTask = statuses?.tasks?.find((t) => t.taskId === 'yield-harvest-reinvest')
  const proof = proofData?.proof

  const harvestEntries = (audit?.entries ?? []).filter(
    (e) => e.stage === 'EXECUTION' && e.pair && String(e.data?.status) === 'EXECUTED'
  )

  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const nextRunMs = harvestTask?.nextRunAt && now ? harvestTask.nextRunAt - now : 0

  return (
    <>
      <Topbar title="Yield-Hustle" />
      <PageWrapper>
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5 gradient-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-glow/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-glow" />
              </div>
              <span className="text-xs text-mist">Compound Interest Gain</span>
            </div>
            <p className="text-3xl font-bold gold-gradient font-mono">
              {proof?.details?.reinvestAmount ? `+${Number(proof.details.reinvestAmount).toLocaleString()}` : '0'}
            </p>
            <p className="text-[10px] text-mist mt-1">Cumulative reinvested yield units</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-glow/10 flex items-center justify-center">
                <Timer className="w-4 h-4 text-amber-glow" />
              </div>
              <span className="text-xs text-mist">Next Harvest</span>
            </div>
            <p className="text-3xl font-bold text-arctic font-mono">
              {nextRunMs > 0 ? formatDuration(nextRunMs) : 'Ready'}
            </p>
            <p className="text-[10px] text-mist mt-1">
              Last: {harvestTask?.lastRunAt ? timeAgo(harvestTask.lastRunAt) : 'never'}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-glow/10 flex items-center justify-center">
                <Coins className="w-4 h-4 text-indigo-glow" />
              </div>
              <span className="text-xs text-mist">Task Status</span>
            </div>
            <p className={cn(
              'text-2xl font-bold font-mono',
              harvestTask?.state === 'EXECUTED' && 'text-emerald-glow',
              harvestTask?.state === 'RUNNING' && 'text-amber-glow',
              harvestTask?.state === 'FAILED' && 'text-rose-glow',
              (!harvestTask?.state || harvestTask.state === 'IDLE') && 'text-mist'
            )}>
              {harvestTask?.state ?? 'IDLE'}
            </p>
            <p className="text-[10px] text-mist mt-1 line-clamp-1">{harvestTask?.lastMessage ?? 'Awaiting first run'}</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
          {/* Harvest Flow Visualization */}
          <div className="lg:col-span-2 glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-5">Autonomous Harvest Pipeline</h3>
            <div className="flex items-center justify-between px-4">
              {[
                { label: 'Detect Rewards', icon: Sprout, desc: 'Monitor stablecoin growth', color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
                { label: 'Calculate Size', icon: Coins, desc: 'Apply reinvest BPS share', color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
                { label: 'Verify & Execute', icon: Zap, desc: 'Policy + sim + swap', color: 'text-gold-500', bg: 'bg-gold-500/10' },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-4">
                  <div className="flex flex-col items-center text-center">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', step.bg)}>
                      <step.icon className={cn('w-6 h-6', step.color)} />
                    </div>
                    <span className="text-xs font-medium text-arctic mt-2">{step.label}</span>
                    <span className="text-[10px] text-mist mt-0.5 max-w-[100px]">{step.desc}</span>
                  </div>
                  {i < 2 && <ArrowRight className="w-5 h-5 text-mist/30 mb-6" />}
                </div>
              ))}
            </div>

            {/* Trigger button */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => trigger('yield-harvest-reinvest')}
                disabled={isPending}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-sm font-semibold hover:from-gold-400 hover:to-gold-500 transition-all disabled:opacity-40"
                id="trigger-harvest"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Trigger Harvest Now
              </button>
            </div>
          </div>

          {/* Latest Proof */}
          <div className="glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-3">Latest Harvest Proof</h3>
            {proof ? (
              <div className="space-y-2">
                <div className="flex justify-between py-1.5"><span className="text-xs text-mist">State</span><span className={cn('text-xs font-mono', proof.state === 'EXECUTED' ? 'text-emerald-glow' : 'text-mist')}>{proof.state}</span></div>
                <div className="flex justify-between py-1.5"><span className="text-xs text-mist">Trigger</span><span className="text-xs font-mono text-arctic">{proof.trigger}</span></div>
                <div className="flex justify-between py-1.5"><span className="text-xs text-mist">Pair</span><span className="text-xs font-mono text-arctic">{proof.pairId ?? '—'}</span></div>
                <div className="flex justify-between py-1.5"><span className="text-xs text-mist">Time</span><span className="text-xs font-mono text-mist">{timeAgo(proof.timestamp)}</span></div>
                <div className="pt-2 border-t border-glass-border">
                  <p className="text-xs text-mist/70 leading-relaxed">{proof.message}</p>
                </div>
                {Object.keys(proof.details).length > 0 && (
                  <pre className="text-[10px] text-mist/60 font-mono bg-space-950 rounded-lg p-2 overflow-x-auto max-h-[120px] mt-2">
                    {JSON.stringify(proof.details, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-mist text-sm">
                <Sprout className="w-8 h-8 mx-auto mb-2 text-mist/30" />
                <p>No harvest proof available yet</p>
              </div>
            )}
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
