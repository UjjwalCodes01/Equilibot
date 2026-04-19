'use client'

import { useAgentStatus } from '@/hooks/use-telemetry'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Eye, Cpu, ShieldCheck, Rocket } from 'lucide-react'

const STEPS = [
  { key: 'observe', label: 'Observe', description: 'Read-only market monitoring', icon: Eye, color: 'indigo-glow' },
  { key: 'simulate', label: 'Simulate', description: 'Dry-run with policy checks', icon: Cpu, color: 'cyan-glow' },
  { key: 'canary', label: 'Canary', description: 'Live with reduced limits', icon: ShieldCheck, color: 'amber-glow' },
  { key: 'active', label: 'Active', description: 'Full autonomous execution', icon: Rocket, color: 'emerald-glow' },
] as const

export function ExecutionLadder() {
  const { data: status } = useAgentStatus()
  const currentMode = status?.executionMode || 'observe'
  const currentIndex = STEPS.findIndex((s) => s.key === currentMode)

  return (
    <div className="glass-panel p-5">
      <h3 className="text-sm font-semibold text-arctic mb-5">Execution Mode Ladder</h3>
      <div className="flex items-start justify-between relative">
        {/* Progress bar background */}
        <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-glass-border" />
        {/* Progress bar fill */}
        <motion.div
          className="absolute top-5 left-[10%] h-0.5 bg-gold-500"
          initial={{ width: '0%' }}
          animate={{ width: `${(currentIndex / (STEPS.length - 1)) * 80}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        {STEPS.map((step, i) => {
          const isActive = i === currentIndex
          const isPast = i < currentIndex
          const Icon = step.icon

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
              <motion.div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300',
                  isActive && `bg-${step.color}/20 ring-2 ring-${step.color}/50 glow-gold`,
                  isPast && 'bg-gold-500/15',
                  !isActive && !isPast && 'bg-space-700'
                )}
                animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Icon className={cn(
                  'w-5 h-5',
                  isActive && `text-${step.color}`,
                  isPast && 'text-gold-500',
                  !isActive && !isPast && 'text-mist/50'
                )} />
              </motion.div>
              <span className={cn(
                'text-xs font-medium mt-2',
                isActive ? 'text-arctic' : isPast ? 'text-gold-500/70' : 'text-mist/50'
              )}>
                {step.label}
              </span>
              <span className={cn(
                'text-[10px] mt-0.5 text-center max-w-[100px]',
                isActive ? 'text-mist' : 'text-mist/30'
              )}>
                {step.description}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
