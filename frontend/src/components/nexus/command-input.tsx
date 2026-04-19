'use client'

import { useState } from 'react'
import { useTriggerTask } from '@/hooks/use-telemetry'
import { Send, Loader2 } from 'lucide-react'
import type { AutonomousTaskId } from '@/lib/api/types'

const COMMAND_MAP: Record<string, AutonomousTaskId> = {
  'rebalance': 'delta-neutral-rebalance',
  'delta': 'delta-neutral-rebalance',
  'neutral': 'delta-neutral-rebalance',
  'migrate': 'convex-lp-migration',
  'migration': 'convex-lp-migration',
  'lp': 'convex-lp-migration',
  'buyback': 'protocol-buyback-burn',
  'burn': 'protocol-buyback-burn',
  'harvest': 'yield-harvest-reinvest',
  'yield': 'yield-harvest-reinvest',
  'reinvest': 'yield-harvest-reinvest',
}

export function CommandInput() {
  const [input, setInput] = useState('')
  const { mutate: trigger, isPending } = useTriggerTask()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const lower = input.toLowerCase().trim()
    const taskId = Object.entries(COMMAND_MAP).find(([key]) => lower.includes(key))?.[1]
    if (taskId) {
      trigger(taskId)
      setInput('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-glass-border">
      <input
        id="nexus-command-input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a command… (e.g. 'run delta rebalance')"
        className="flex-1 bg-transparent text-sm text-arctic placeholder:text-mist/40 outline-none"
        disabled={isPending}
      />
      <button
        type="submit"
        disabled={isPending || !input.trim()}
        className="w-8 h-8 rounded-lg bg-gold-500/10 text-gold-400 hover:bg-gold-500/20 flex items-center justify-center transition-colors disabled:opacity-30"
        id="nexus-send-btn"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </form>
  )
}
