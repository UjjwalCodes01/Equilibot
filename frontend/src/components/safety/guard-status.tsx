'use client'

import { useReadContract } from 'wagmi'
import { swapGuardAbi } from '@/lib/contracts/abis'
import { CONTRACT_ADDRESSES, bscTestnet } from '@/lib/contracts/config'
import { formatBps, formatSeconds } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ShieldCheck, Timer, Gauge, Clock, AlertTriangle, TrendingDown } from 'lucide-react'

function useGuardRead(functionName: string) {
  return useReadContract({
    address: CONTRACT_ADDRESSES.guard,
    abi: swapGuardAbi,
    functionName: functionName as 'paused',
    chainId: bscTestnet.id,
  })
}

export function GuardStatus() {
  const { data: paused } = useGuardRead('paused')
  const { data: maxSlippage } = useGuardRead('maxSlippageBps')
  const { data: cooldown } = useGuardRead('cooldownSeconds')
  const { data: maxDeadline } = useGuardRead('maxDeadlineDelay')
  const { data: maxOracleStaleness } = useGuardRead('maxOracleStaleness')
  const { data: maxOracleDeviation } = useGuardRead('maxOracleDeviationBps')


  const isPaused = paused === true

  const items = [
    { label: 'Status', value: isPaused ? 'PAUSED' : 'ACTIVE', icon: ShieldCheck, highlight: true, danger: isPaused },
    { label: 'Max Slippage', value: maxSlippage != null ? formatBps(Number(maxSlippage)) : '—', icon: TrendingDown },
    { label: 'Cooldown', value: cooldown != null ? formatSeconds(Number(cooldown)) : '—', icon: Timer },
    { label: 'Max Deadline', value: maxDeadline != null ? formatSeconds(Number(maxDeadline)) : '—', icon: Clock },
    { label: 'Oracle Staleness', value: maxOracleStaleness != null ? formatSeconds(Number(maxOracleStaleness)) : '—', icon: AlertTriangle },
    { label: 'Oracle Deviation', value: maxOracleDeviation != null ? formatBps(Number(maxOracleDeviation)) : '—', icon: Gauge },
  ]

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-cyan-glow/10 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-cyan-glow" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-arctic">SwapGuard</h3>
          <p className="text-[10px] text-mist font-mono">{CONTRACT_ADDRESSES.guard}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
            <div className="flex items-center gap-2">
              <item.icon className="w-3.5 h-3.5 text-mist" />
              <span className="text-xs text-mist">{item.label}</span>
            </div>
            <span className={cn(
              'text-xs font-mono',
              item.highlight && !item.danger && 'text-emerald-glow',
              item.highlight && item.danger && 'text-rose-glow',
              !item.highlight && 'text-arctic'
            )}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
