'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useTaskStatuses, useTaskProof, useTriggerTask } from '@/hooks/use-telemetry'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { timeAgo } from '@/lib/format'
import { Layers, Flame, Play, Loader2, ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useState } from 'react'

const STRATEGIES = [
  { id: 'full-range', label: 'Full Range', desc: 'Maximum coverage, lowest concentration. Ideal for low-volatility stable pairs.', risk: 'Low', color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
  { id: 'active-support', label: 'Active Support', desc: 'Tight range around current price. Higher fees, requires monitoring.', risk: 'Medium', color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
  { id: 'volatility-buffer', label: 'Volatility Buffer', desc: 'Asymmetric range biased for downside protection. Best during uncertainty.', risk: 'High', color: 'text-rose-glow', bg: 'bg-rose-glow/10' },
]

// Generate mock price range data for visualization
const RANGE_DATA = Array.from({ length: 60 }, (_, i) => {
  const x = (i - 30) / 10
  return {
    price: (300 + i * 2).toString(),
    liquidity: Math.max(0, 80 * Math.exp(-x * x / 2)),
  }
})

export default function LifecyclePage() {
  const [selectedStrategy, setSelectedStrategy] = useState('active-support')
  const { data: statuses } = useTaskStatuses()
  const { data: buybackProof } = useTaskProof('protocol-buyback-burn')
  const { mutate: trigger, isPending } = useTriggerTask()

  const buybackTask = statuses?.tasks?.find((t) => t.taskId === 'protocol-buyback-burn')
  const proof = buybackProof?.proof

  return (
    <>
      <Topbar title="Token Lifecycle Manager" />
      <PageWrapper>
        {/* Strategy Selector */}
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-arctic mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-gold-500" /> Concentrated Liquidity Strategy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STRATEGIES.map((s) => (
              <motion.button
                key={s.id}
                onClick={() => setSelectedStrategy(s.id)}
                className={cn(
                  'text-left p-4 rounded-xl border transition-all',
                  selectedStrategy === s.id
                    ? 'border-gold-500/40 bg-gold-500/5 glow-gold'
                    : 'border-glass-border hover:border-glass-border/50 hover:bg-glass-hover'
                )}
                whileTap={{ scale: 0.98 }}
                id={`strategy-${s.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-arctic">{s.label}</span>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', s.bg, s.color)}>{s.risk}</span>
                </div>
                <p className="text-xs text-mist/70 leading-relaxed">{s.desc}</p>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-5">
          {/* Range Visualizer */}
          <div className="lg:col-span-3 glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-glow" /> Position Range Visualizer
            </h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={RANGE_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gradLiq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4a843" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#d4a843" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="price" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ReferenceLine x="360" stroke="#22d3ee" strokeDasharray="4 4" label={{ value: 'Current', fill: '#22d3ee', fontSize: 10, position: 'top' }} />
                  <Area type="monotone" dataKey="liquidity" stroke="#d4a843" fill="url(#gradLiq)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-mist">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gold-500" />
                <span>Liquidity Distribution</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-0.5 bg-cyan-glow" style={{ borderTop: '2px dashed' }} />
                <span>Current Price</span>
              </div>
            </div>
          </div>

          {/* Buyback & Burn Status */}
          <div className="lg:col-span-2 space-y-5">
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-glow/10 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-amber-glow" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-arctic">Buyback & Burn</h3>
                  <p className="text-[10px] text-mist">{buybackTask?.state ?? 'IDLE'}</p>
                </div>
              </div>

              <div className="space-y-2">
                {proof?.details?.stableUsd != null ? (
                  <div className="flex justify-between py-2 px-3 rounded-lg bg-space-900/50">
                    <span className="text-xs text-mist">Stable Reserve</span>
                    <span className="text-xs font-mono text-arctic">${Number(proof.details.stableUsd).toLocaleString()}</span>
                  </div>
                ) : null}
                {proof?.details?.burnAddress != null ? (
                  <div className="flex justify-between py-2 px-3 rounded-lg bg-space-900/50">
                    <span className="text-xs text-mist">Burn Address</span>
                    <span className="text-xs font-mono text-mist">0x…dEaD</span>
                  </div>
                ) : null}
                <div className="flex justify-between py-2 px-3 rounded-lg bg-space-900/50">
                  <span className="text-xs text-mist">Last Run</span>
                  <span className="text-xs font-mono text-mist">{buybackTask?.lastRunAt ? timeAgo(buybackTask.lastRunAt) : 'never'}</span>
                </div>
              </div>

              <button
                onClick={() => trigger('protocol-buyback-burn')}
                disabled={isPending}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-glow/10 text-amber-glow text-sm font-medium hover:bg-amber-glow/20 transition-colors disabled:opacity-40"
                id="trigger-buyback"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Trigger Buyback
              </button>
            </div>

            {proof?.message && (
              <div className="glass-panel-sm p-4">
                <p className="text-xs text-mist/70 leading-relaxed">{proof.message}</p>
              </div>
            )}
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
