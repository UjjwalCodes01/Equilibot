'use client'

import { useReadContract } from 'wagmi'
import { equiliBotModuleAbi } from '@/lib/contracts/abis'
import { CONTRACT_ADDRESSES, bscTestnet } from '@/lib/contracts/config'
import { formatAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Shield, User, Vault, Lock, Eye } from 'lucide-react'

function useModuleRead(functionName: string) {
  return useReadContract({
    address: CONTRACT_ADDRESSES.module,
    abi: equiliBotModuleAbi,
    functionName: functionName as 'paused',
    chainId: bscTestnet.id,
  })
}

export function ModuleStatus() {
  const { data: paused } = useModuleRead('paused')
  const { data: agent } = useModuleRead('agent')
  const { data: safe } = useModuleRead('safe')
  const { data: guard } = useModuleRead('guard')
  const { data: isolation } = useModuleRead('strictTokenIsolation')
  const { data: owner } = useModuleRead('owner')

  const isPaused = paused === true
  const items = [
    { label: 'Status', value: isPaused ? 'PAUSED' : 'ACTIVE', icon: Shield, highlight: true, danger: isPaused },
    { label: 'Agent', value: formatAddress(agent ? String(agent) : ''), icon: User },
    { label: 'Safe', value: formatAddress(safe ? String(safe) : ''), icon: Vault },
    { label: 'Guard', value: formatAddress(guard ? String(guard) : ''), icon: Shield },
    { label: 'Owner', value: formatAddress(owner ? String(owner) : ''), icon: User },
    { label: 'Token Isolation', value: isolation ? 'STRICT' : 'RELAXED', icon: Lock },
  ]

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-glow/10 flex items-center justify-center">
          <Eye className="w-4 h-4 text-indigo-glow" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-arctic">EquiliBotModule</h3>
          <p className="text-[10px] text-mist font-mono">{CONTRACT_ADDRESSES.module}</p>
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
              {item.value || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
