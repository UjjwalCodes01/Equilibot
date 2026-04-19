'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useAgentMetrics, useAuditLog, useTaskProof } from '@/hooks/use-telemetry'
import { formatNumber, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PieChart, ResponsiveContainer, Cell, Pie, Tooltip } from 'recharts'
import { Scale, TrendingUp, ShieldCheck, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function PortfolioPage() {
  const { data: metrics } = useAgentMetrics()
  const { data: audit } = useAuditLog()
  const { data: rebalanceProof } = useTaskProof('delta-neutral-rebalance')

  const proof = rebalanceProof?.proof
  const valueA = proof?.details?.valueAUsd ? Number(proof.details.valueAUsd) / 1e8 : 50
  const valueB = proof?.details?.valueBUsd ? Number(proof.details.valueBUsd) / 1e8 : 50
  const total = valueA + valueB || 1

  const allocData = [
    { name: 'WBNB (Volatile)', value: valueA, color: '#818cf8' },
    { name: 'BUSD (Floor Fund)', value: valueB, color: '#10b981' },
  ]

  const rebalanceEntries = audit?.entries?.filter(
    (e) => e.stage === 'EXECUTION' && e.data?.status === 'EXECUTED'
  ) ?? []

  const driftBps = proof?.details?.driftBps ?? (proof?.message?.match(/(\d+)bps/)?.[1] || '—')

  return (
    <>
      <Topbar title="Active Management" />
      <PageWrapper>
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Executions', value: formatNumber(metrics?.executionsSucceeded ?? 0), icon: Activity, color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
            { label: 'Simulations Passed', value: formatNumber(metrics?.simulationsPassed ?? 0), icon: ShieldCheck, color: 'text-cyan-glow', bg: 'bg-cyan-glow/10' },
            { label: 'Treasury Drift', value: `${driftBps}bps`, icon: Scale, color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
            { label: 'Slippage Saved', value: `~${formatNumber((metrics?.executionsSucceeded ?? 0) * 0.12, 2)}%`, icon: TrendingUp, color: 'text-gold-500', bg: 'bg-gold-500/10' },
          ].map((kpi) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', kpi.bg)}>
                <kpi.icon className={cn('w-5 h-5', kpi.color)} />
              </div>
              <div>
                <p className="text-xl font-bold text-arctic font-mono">{kpi.value}</p>
                <p className="text-[10px] text-mist">{kpi.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-5">
          {/* Allocation Chart */}
          <div className="lg:col-span-2 glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-4">Treasury Allocation</h3>
            <div className="h-[240px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {allocData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 12, fontSize: 12, color: '#f8fafc' }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              {allocData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs text-mist">{d.name}</span>
                  <span className="text-xs font-mono text-arctic">{((d.value / total) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rebalance History */}
          <div className="lg:col-span-3 glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-4">Rebalance History</h3>
            <div className="space-y-2 max-h-[340px] overflow-y-auto">
              {rebalanceEntries.length === 0 && (
                <div className="text-center py-12 text-mist text-sm">
                  <Scale className="w-8 h-8 mx-auto mb-3 text-mist/30" />
                  <p>No rebalance executions yet</p>
                  <p className="text-xs text-mist/50 mt-1">The agent will execute when treasury drift exceeds threshold</p>
                </div>
              )}
              {rebalanceEntries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-space-900/50 hover:bg-space-700/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-glow/10 flex items-center justify-center">
                      {entry.data?.direction === 'BUY_A' ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-glow" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-cyan-glow" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-arctic">{String(entry.data?.direction ?? 'Rebalance')}</p>
                      <p className="text-[10px] text-mist">{entry.pair}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-mist font-mono">
                      {entry.data?.txHash ? `${String(entry.data.txHash).slice(0, 12)}…` : '—'}
                    </p>
                    <p className="text-[10px] text-mist/50">{timeAgo(new Date(entry.timestamp).getTime())}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
