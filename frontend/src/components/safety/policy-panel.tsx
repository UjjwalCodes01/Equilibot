'use client'

import { usePolicy } from '@/hooks/use-telemetry'
import { useReadContract } from 'wagmi'
import { swapGuardAbi } from '@/lib/contracts/abis'
import { CONTRACT_ADDRESSES, TOKENS, bscTestnet } from '@/lib/contracts/config'
import { formatAddress, formatTokenAmount, timeAgo } from '@/lib/format'

import { Check, X, Coins, Router } from 'lucide-react'

const KNOWN_TOKENS = [
  { symbol: 'WBNB', address: TOKENS.WBNB },
  { symbol: 'BUSD', address: TOKENS.BUSD },
]

const KNOWN_ROUTERS = [
  { label: 'PancakeSwap V2 Router', address: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1' as `0x${string}` },
]

export function PolicyPanel() {
  const { data: policy } = usePolicy()

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-arctic">On-Chain Policy</h3>
        {policy?.cachedAt && (
          <span className="text-[10px] text-mist/50">Cached {timeAgo(policy.cachedAt)}</span>
        )}
      </div>

      {/* Token Allowlist */}
      <div className="mb-4">
        <h4 className="text-xs text-mist font-medium mb-2 flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5" /> Allowed Tokens
        </h4>
        <div className="space-y-1.5">
          {KNOWN_TOKENS.map((token) => (
            <TokenRow key={token.address} symbol={token.symbol} address={token.address} />
          ))}
        </div>
      </div>

      {/* Router Allowlist */}
      <div>
        <h4 className="text-xs text-mist font-medium mb-2 flex items-center gap-1.5">
          <Router className="w-3.5 h-3.5" /> Allowed Routers
        </h4>
        <div className="space-y-1.5">
          {KNOWN_ROUTERS.map((router) => (
            <RouterRow key={router.address} label={router.label} address={router.address} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TokenRow({ symbol, address }: { symbol: string; address: `0x${string}` }) {
  const { data: allowed } = useReadContract({
    address: CONTRACT_ADDRESSES.guard,
    abi: swapGuardAbi,
    functionName: 'allowedTokens',
    args: [address],
    chainId: bscTestnet.id,
  })

  const { data: minTrade } = useReadContract({
    address: CONTRACT_ADDRESSES.guard,
    abi: swapGuardAbi,
    functionName: 'minTradeAmount',
    args: [address],
    chainId: bscTestnet.id,
  })

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
      <div className="flex items-center gap-2">
        {allowed ? <Check className="w-3.5 h-3.5 text-emerald-glow" /> : <X className="w-3.5 h-3.5 text-rose-glow" />}
        <span className="text-xs font-medium text-arctic">{symbol}</span>
        <span className="text-[10px] text-mist font-mono">{formatAddress(address)}</span>
      </div>
      <span className="text-[10px] text-mist font-mono">
        Min: {minTrade != null ? formatTokenAmount(minTrade as bigint, 18) : '—'}
      </span>
    </div>
  )
}

function RouterRow({ label, address }: { label: string; address: `0x${string}` }) {
  const { data: allowed } = useReadContract({
    address: CONTRACT_ADDRESSES.guard,
    abi: swapGuardAbi,
    functionName: 'allowedRouters',
    args: [address],
    chainId: bscTestnet.id,
  })

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-space-900/50">
      <div className="flex items-center gap-2">
        {allowed ? <Check className="w-3.5 h-3.5 text-emerald-glow" /> : <X className="w-3.5 h-3.5 text-rose-glow" />}
        <span className="text-xs font-medium text-arctic">{label}</span>
      </div>
      <span className="text-[10px] text-mist font-mono">{formatAddress(address)}</span>
    </div>
  )
}
