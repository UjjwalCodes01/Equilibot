'use client'

import { useTaskStatuses, useTriggerTask } from '@/hooks/use-telemetry'
import { timeAgo, formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Play, Loader2, GitMerge, Scale, Flame, Sprout } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { AutonomousTaskId } from '@/lib/api/types'

const TASK_META: Record<AutonomousTaskId, { label: string; icon: typeof Scale; color: string }> = {
  'delta-neutral-rebalance': { label: 'Delta-Neutral Rebalance', icon: Scale, color: 'text-indigo-glow' },
  'convex-lp-migration': { label: 'LP Migration', icon: GitMerge, color: 'text-cyan-glow' },
  'protocol-buyback-burn': { label: 'Buyback & Burn', icon: Flame, color: 'text-amber-glow' },
  'yield-harvest-reinvest': { label: 'Yield Harvest', icon: Sprout, color: 'text-emerald-glow' },
}

const STATE_STYLES: Record<string, string> = {
  IDLE: 'text-mist',
  RUNNING: 'text-amber-glow',
  SKIPPED: 'text-mist',
  REJECTED: 'text-rose-glow',
  FAILED: 'text-rose-glow',
  EXECUTED: 'text-emerald-glow',
}

export function TaskCards() {
  const { data } = useTaskStatuses()
  const { mutate: trigger, isPending, variables } = useTriggerTask()

  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const tasks = data?.tasks ?? []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tasks.map((task) => {
        const meta = TASK_META[task.taskId] || { label: task.taskId, icon: Scale, color: 'text-mist' }
        const Icon = meta.icon
        const isTriggering = isPending && variables === task.taskId

        return (
          <motion.div
            key={task.taskId}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-4 flex flex-col gap-3 group hover:glow-gold transition-shadow duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Icon className={cn('w-4.5 h-4.5', meta.color)} />
                <span className="text-sm font-medium text-arctic">{meta.label}</span>
              </div>
              <span className={cn('text-xs font-mono uppercase', STATE_STYLES[task.state] || 'text-mist')}>
                {task.state}
              </span>
            </div>

            {task.lastMessage && (
              <p className="text-xs text-mist/70 leading-relaxed line-clamp-2">{task.lastMessage}</p>
            )}

            <div className="flex items-center justify-between text-[10px] text-mist/50">
              <span>Last: {task.lastRunAt ? timeAgo(task.lastRunAt) : 'never'}</span>
              <span>Next: {task.nextRunAt && now ? formatDuration(task.nextRunAt - now) : '—'}</span>
            </div>

            <button
              onClick={() => trigger(task.taskId)}
              disabled={isTriggering || task.state === 'RUNNING'}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all',
                'bg-gold-500/10 text-gold-400 hover:bg-gold-500/20 disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              id={`trigger-${task.taskId}`}
            >
              {isTriggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {isTriggering ? 'Running…' : 'Trigger Manually'}
            </button>
          </motion.div>
        )
      })}

      {tasks.length === 0 && (
        <div className="col-span-2 glass-panel p-8 text-center text-mist text-sm">
          <p>Connect the agent to see autonomous task statuses</p>
        </div>
      )}
    </div>
  )
}
