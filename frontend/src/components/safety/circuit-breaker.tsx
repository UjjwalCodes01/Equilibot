'use client'

import { useAgentStatus } from '@/hooks/use-telemetry'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Zap, ZapOff } from 'lucide-react'

export function CircuitBreakerPanel() {
  const { data: status } = useAgentStatus()
  const cb = status?.circuitBreaker
  const tripped = cb?.tripped ?? false

  return (
    <div className={cn('glass-panel p-5', tripped && 'gold-border glow-rose')}>
      <div className="flex items-center gap-2 mb-4">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          tripped ? 'bg-rose-glow/15' : 'bg-emerald-glow/10'
        )}>
          {tripped ? <ZapOff className="w-4 h-4 text-rose-glow" /> : <Zap className="w-4 h-4 text-emerald-glow" />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-arctic">Circuit Breaker</h3>
          <p className={cn('text-[10px] font-medium', tripped ? 'text-rose-glow' : 'text-emerald-glow')}>
            {tripped ? 'TRIPPED — Execution halted' : 'Healthy'}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
          <span className="text-xs text-mist">Consecutive Failures</span>
          <span className={cn('text-xs font-mono', (cb?.consecutiveFailures ?? 0) > 0 ? 'text-amber-glow' : 'text-arctic')}>
            {cb?.consecutiveFailures ?? 0}
          </span>
        </div>
        {cb?.tripReason && (
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
            <span className="text-xs text-mist">Trip Reason</span>
            <span className="text-xs font-mono text-rose-glow truncate max-w-[200px]">{cb.tripReason}</span>
          </div>
        )}
        {cb?.trippedAt && (
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
            <span className="text-xs text-mist">Tripped At</span>
            <span className="text-xs font-mono text-mist">{timeAgo(cb.trippedAt)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
