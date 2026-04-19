'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useTaskProof, useTaskStatuses } from '@/hooks/use-telemetry'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Map, Flame, ArrowRightLeft, Calculator, TrendingUp } from 'lucide-react'
import { useState } from 'react'

const FEE_TIERS = [
  { tier: 100, label: '0.01%', volume: 12500, fees: 1.25, efficiency: 92, dex: 'PancakeSwap V3' },
  { tier: 500, label: '0.05%', volume: 85000, fees: 42.5, efficiency: 96, dex: 'PancakeSwap V3' },
  { tier: 2500, label: '0.25%', volume: 34000, fees: 85, efficiency: 78, dex: 'PancakeSwap V3' },
  { tier: 10000, label: '1.00%', volume: 8000, fees: 80, efficiency: 45, dex: 'PancakeSwap V3' },
  { tier: 300, label: '0.30%', volume: 22000, fees: 66, efficiency: 71, dex: 'BiSwap' },
  { tier: 500, label: '0.10%', volume: 15000, fees: 15, efficiency: 65, dex: 'ApeSwap' },
]

const COLORS = ['#818cf8', '#10b981', '#f59e0b', '#f43f5e', '#22d3ee', '#a78bfa']

export default function ArbitragePage() {
  const { data: proofData } = useTaskProof('convex-lp-migration')
  const { data: statuses } = useTaskStatuses()
  const [ilInput, setIlInput] = useState({ amount: '1000', priceChange: '10' })

  const migrationTask = statuses?.tasks?.find((t) => t.taskId === 'convex-lp-migration')
  const proof = proofData?.proof

  const bestTier = FEE_TIERS.reduce((best, t) => t.efficiency > best.efficiency ? t : best, FEE_TIERS[0]!)

  // Simple IL calculator
  const priceChangeNum = parseFloat(ilInput.priceChange) / 100 || 0
  const ilPercent = priceChangeNum ? (2 * Math.sqrt(1 + priceChangeNum) / (2 + priceChangeNum) - 1) * 100 : 0

  return (
    <>
      <Topbar title="Incentive Arbitrage Map" />
      <PageWrapper>
        {/* Fee Heatmap */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Map className="w-5 h-5 text-gold-500" />
              <h3 className="text-sm font-semibold text-arctic">Volume-Adjusted Fee Landscape</h3>
            </div>
            {bestTier && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-glow/10 text-emerald-glow text-xs font-medium">
                <Flame className="w-3 h-3" />
                Hot Zone: {bestTier.dex} {bestTier.label}
              </div>
            )}
          </div>

          {/* 3D-ish Heatmap Grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            {FEE_TIERS.map((tier, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, rotateX: 10 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'glass-panel-sm p-3 text-center relative overflow-hidden group cursor-pointer hover:scale-105 transition-transform',
                  tier.efficiency === bestTier.efficiency && 'gold-border glow-gold'
                )}
                style={{ perspective: '800px' }}
              >
                <div className="absolute inset-0 opacity-20" style={{
                  background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]!}40, transparent)`
                }} />
                <p className="text-xs font-medium text-arctic relative">{tier.dex}</p>
                <p className="text-lg font-bold font-mono text-arctic relative">{tier.label}</p>
                <div className="mt-2 space-y-0.5 relative">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-mist">Vol</span>
                    <span className="text-arctic">${(tier.volume / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-mist">Fees</span>
                    <span className="text-gold-400">${tier.fees}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-mist">Eff.</span>
                    <span className={cn(tier.efficiency >= 80 ? 'text-emerald-glow' : tier.efficiency >= 60 ? 'text-amber-glow' : 'text-rose-glow')}>
                      {tier.efficiency}%
                    </span>
                  </div>
                </div>
                {/* Efficiency bar */}
                <div className="h-1 bg-space-700 rounded-full mt-2 relative overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${tier.efficiency}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={FEE_TIERS} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 12, fontSize: 12, color: '#f8fafc' }} />
                <Bar dataKey="fees" radius={[6, 6, 0, 0]}>
                  {FEE_TIERS.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          {/* Migration Status */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRightLeft className="w-4 h-4 text-cyan-glow" />
              <h3 className="text-sm font-semibold text-arctic">LP Migration Status</h3>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between py-2 px-3 rounded-lg bg-space-900/50">
                <span className="text-xs text-mist">State</span>
                <span className={cn('text-xs font-mono', migrationTask?.state === 'EXECUTED' ? 'text-emerald-glow' : 'text-mist')}>{migrationTask?.state ?? 'IDLE'}</span>
              </div>
              {proof?.details?.selectedFeeTier != null && (
                <div className="flex justify-between py-2 px-3 rounded-lg bg-space-900/50">
                  <span className="text-xs text-mist">Active Fee Tier</span>
                  <span className="text-xs font-mono text-gold-400">{String(proof.details.selectedFeeTier)}</span>
                </div>
              )}
              {proof?.message && (
                <div className="py-2 px-3 rounded-lg bg-space-900/50">
                  <p className="text-xs text-mist/70">{proof.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* IL Calculator */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-4 h-4 text-amber-glow" />
              <h3 className="text-sm font-semibold text-arctic">Impermanent Loss Estimator</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-mist mb-1 block">Position Size (USD)</label>
                <input
                  type="number" value={ilInput.amount}
                  onChange={(e) => setIlInput((p) => ({ ...p, amount: e.target.value }))}
                  className="w-full bg-space-800 border border-glass-border rounded-lg px-3 py-2 text-sm text-arctic outline-none"
                  id="il-amount"
                />
              </div>
              <div>
                <label className="text-xs text-mist mb-1 block">Price Change (%)</label>
                <input
                  type="number" value={ilInput.priceChange}
                  onChange={(e) => setIlInput((p) => ({ ...p, priceChange: e.target.value }))}
                  className="w-full bg-space-800 border border-glass-border rounded-lg px-3 py-2 text-sm text-arctic outline-none"
                  id="il-price-change"
                />
              </div>
              <div className="pt-3 border-t border-glass-border text-center">
                <p className="text-xs text-mist mb-1">Estimated Impermanent Loss</p>
                <p className={cn('text-2xl font-bold font-mono', ilPercent < -1 ? 'text-rose-glow' : 'text-emerald-glow')}>
                  {ilPercent.toFixed(4)}%
                </p>
                <p className="text-xs text-mist mt-1">
                  ≈ ${(Math.abs(ilPercent / 100) * parseFloat(ilInput.amount || '0')).toFixed(2)} loss
                </p>
              </div>
            </div>
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
