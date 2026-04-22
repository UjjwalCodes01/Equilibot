'use client'

import { useAgentStatus } from '@/hooks/use-telemetry'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Activity, AlertTriangle, Radio, Wifi, WifiOff } from 'lucide-react'
import { WalletButton } from './wallet-button'

const MODE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  observe: { bg: 'bg-indigo-glow/15', text: 'text-indigo-glow', label: 'Observing' },
  simulate: { bg: 'bg-cyan-glow/15', text: 'text-cyan-glow', label: 'Simulating' },
  canary: { bg: 'bg-amber-glow/15', text: 'text-amber-glow', label: 'Canary' },
  active: { bg: 'bg-emerald-glow/15', text: 'text-emerald-glow', label: 'Active' },
}

export function Topbar({ title }: { title: string }) {
  const { data: status, isError } = useAgentStatus()

  const mode = status?.executionMode || 'observe'
  const modeStyle = MODE_STYLES[mode] || MODE_STYLES.observe!

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-glass-border bg-space-950/40 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-arctic tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Chain Badge */}
        <div className="glass-panel-sm flex items-center gap-1.5 px-2.5 py-1 text-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-glow" />
          <span className="text-mist">BSC {status?.chainId === 56 ? 'Mainnet' : 'Testnet'}</span>
        </div>

        {/* Execution Mode */}
        <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium', modeStyle.bg, modeStyle.text)}>
          <Radio className="w-3 h-3" />
          {modeStyle.label}
        </div>

        {/* Circuit Breaker */}
        {status?.circuitBreaker?.tripped && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-glow/15 text-rose-glow">
            <AlertTriangle className="w-3 h-3" />
            Circuit Breaker
          </div>
        )}

        {/* Connection Status */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs',
          isError ? 'text-rose-glow' : 'text-emerald-glow'
        )}>
          {isError ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
          {isError ? 'Offline' : 'Live'}
        </div>

        {/* Uptime */}
        {status && (
          <div className="flex items-center gap-1.5 text-xs text-mist">
            <Activity className="w-3 h-3" />
            {formatDuration(status.uptime)}
          </div>
        )}

        {/* Wallet Button */}
        <WalletButton />
      </div>
    </header>
  )
}
