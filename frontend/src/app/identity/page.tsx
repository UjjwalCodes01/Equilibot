'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useAgentStatus, useAgentMetrics } from '@/hooks/use-telemetry'
import { useReadContract } from 'wagmi'
import { equiliBotModuleAbi } from '@/lib/contracts/abis'
import { CONTRACT_ADDRESSES, bscTestnet, EXPLORER_TX_URL } from '@/lib/contracts/config'
import { formatAddress, formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Fingerprint, ExternalLink, Shield, Zap, Clock, CheckCircle, Activity, Award, TrendingUp } from 'lucide-react'

export default function IdentityPage() {
  const { data: status } = useAgentStatus()
  const { data: metrics } = useAgentMetrics()
  const { data: agent } = useReadContract({ address: CONTRACT_ADDRESSES.module, abi: equiliBotModuleAbi, functionName: 'agent', chainId: bscTestnet.id })

  const successRate = metrics && metrics.executionsAttempted > 0
    ? ((metrics.executionsSucceeded / metrics.executionsAttempted) * 100)
    : 100

  const simPassRate = metrics && metrics.simulationsRun > 0
    ? ((metrics.simulationsPassed / metrics.simulationsRun) * 100)
    : 100

  const uptimeHours = (status?.uptime ?? 0) / 3_600_000
  const reputationScore = Math.min(100, Math.round(
    (successRate * 0.4) + (simPassRate * 0.3) + (Math.min(uptimeHours / 72, 1) * 100 * 0.3)
  ))

  const explorerBase = 'https://testnet.bscscan.com/address/'

  return (
    <>
      <Topbar title="DAO Identity" />
      <PageWrapper>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Agent Identity Card */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel p-6 gradient-border relative overflow-hidden"
            >
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-gold-500/5 rounded-full blur-3xl" />

              <div className="relative">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center mb-4 glow-gold">
                  <Fingerprint className="w-8 h-8 text-space-950" />
                </div>

                <h3 className="text-lg font-bold gold-gradient mb-1">EquiliBot Executive</h3>
                <p className="text-xs text-mist mb-4">Autonomous Treasury Agent · BAP-578 Identity</p>

                <div className="space-y-2.5">
                  {[
                    { label: 'Agent', value: agent as string, key: 'agent' },
                    { label: 'Safe', value: CONTRACT_ADDRESSES.safe, key: 'safe' },
                    { label: 'Module', value: CONTRACT_ADDRESSES.module, key: 'module' },
                    { label: 'Guard', value: CONTRACT_ADDRESSES.guard, key: 'guard' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-mist">{item.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-arctic">{formatAddress(item.value || '')}</span>
                        {item.value && (
                          <a href={`${explorerBase}${item.value}`} target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-glass-border flex items-center justify-between">
                  <span className="text-xs text-mist">Chain</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-glow" />
                    <span className="text-xs text-arctic">BNB Smart Chain {status?.chainId === 56 ? 'Mainnet' : 'Testnet'}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Reputation Score */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <Award className="w-5 h-5 text-gold-500" />
                <h3 className="text-sm font-semibold text-arctic">Agent Reputation Score</h3>
              </div>

              <div className="flex items-center gap-8">
                {/* Score circle */}
                <div className="relative w-28 h-28 shrink-0">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={reputationScore >= 80 ? '#10b981' : reputationScore >= 50 ? '#f59e0b' : '#f43f5e'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(reputationScore / 100) * 264} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-arctic font-mono">{reputationScore}</span>
                    <span className="text-[10px] text-mist">/ 100</span>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="flex-1 space-y-3">
                  {[
                    { label: 'Execution Success', value: successRate, weight: '40%', icon: CheckCircle },
                    { label: 'Simulation Accuracy', value: simPassRate, weight: '30%', icon: Shield },
                    { label: 'Uptime Score', value: Math.min(100, (uptimeHours / 72) * 100), weight: '30%', icon: Clock },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <item.icon className="w-3 h-3 text-mist" />
                          <span className="text-xs text-mist">{item.label}</span>
                        </div>
                        <span className="text-xs font-mono text-arctic">{item.value.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-space-700 rounded-full overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full', item.value >= 80 ? 'bg-emerald-glow' : item.value >= 50 ? 'bg-amber-glow' : 'bg-rose-glow')}
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Performance Stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              {[
                { label: 'Pipeline Runs', value: formatNumber(metrics?.pipelineRuns ?? 0), icon: Activity },
                { label: 'Pairs Watched', value: formatNumber(status?.pairsWatched ?? 0), icon: TrendingUp },
                { label: 'Policies Passed', value: formatNumber(metrics?.policyChecksPassed ?? 0), icon: CheckCircle },
                { label: 'Uptime', value: formatDuration(status?.uptime ?? 0), icon: Clock },
              ].map((stat) => (
                <div key={stat.label} className="glass-panel-sm p-3 text-center">
                  <stat.icon className="w-4 h-4 text-mist mx-auto mb-1.5" />
                  <p className="text-lg font-bold text-arctic font-mono">{stat.value}</p>
                  <p className="text-[10px] text-mist">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
