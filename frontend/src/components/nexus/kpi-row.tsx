'use client'

import { useAgentMetrics } from '@/hooks/use-telemetry'
import { formatNumber } from '@/lib/format'
import { motion } from 'framer-motion'
import { Eye, Cpu, ShieldCheck, Rocket } from 'lucide-react'

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export function KpiRow() {
  const { data: metrics } = useAgentMetrics()

  const kpis = [
    {
      label: 'Pipeline Runs',
      value: metrics?.pipelineRuns ?? 0,
      icon: Eye,
      color: 'text-indigo-glow',
      bg: 'bg-indigo-glow/10',
      glow: 'glow-cyan',
    },
    {
      label: 'Opportunities',
      value: metrics?.opportunitiesDetected ?? 0,
      icon: Cpu,
      color: 'text-amber-glow',
      bg: 'bg-amber-glow/10',
      glow: 'glow-gold',
    },
    {
      label: 'Sims Passed',
      value: metrics?.simulationsPassed ?? 0,
      icon: ShieldCheck,
      color: 'text-cyan-glow',
      bg: 'bg-cyan-glow/10',
      glow: 'glow-cyan',
    },
    {
      label: 'Executions',
      value: metrics?.executionsSucceeded ?? 0,
      icon: Rocket,
      color: 'text-emerald-glow',
      bg: 'bg-emerald-glow/10',
      glow: 'glow-emerald',
    },
  ]

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {kpis.map((kpi) => (
        <motion.div
          key={kpi.label}
          variants={item}
          className="glass-panel p-4 flex items-center gap-4 group hover:scale-[1.02] transition-transform duration-200"
        >
          <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
            <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-arctic font-mono">
              {formatNumber(kpi.value)}
            </p>
            <p className="text-xs text-mist">{kpi.label}</p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
