'use client'

import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { bscTestnet } from '@/lib/contracts/config'
import { formatEther } from 'viem'
import { cn } from '@/lib/utils'
import { Wallet, LogOut, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address, chainId: bscTestnet.id })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!isConnected) {
    return (
      <button
        onClick={() => {
          const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0]
          if (injected) connect({ connector: injected, chainId: bscTestnet.id })
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-xs font-semibold hover:from-gold-400 hover:to-gold-500 transition-all"
        id="connect-wallet-btn"
      >
        <Wallet className="w-3.5 h-3.5" />
        Connect Wallet
      </button>
    )
  }

  const shortAddr = `${address?.slice(0, 6)}…${address?.slice(-4)}`
  const isWrongChain = chain?.id !== bscTestnet.id

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
          isWrongChain
            ? 'border-rose-glow/30 bg-rose-glow/10 text-rose-glow'
            : 'border-glass-border bg-glass-hover text-arctic hover:bg-space-700'
        )}
        id="wallet-status-btn"
      >
        <div className={cn('w-2 h-2 rounded-full', isWrongChain ? 'bg-rose-glow' : 'bg-emerald-glow')} />
        <span className="font-mono">{shortAddr}</span>
        {balance && (
          <span className="text-mist ml-1">
            {parseFloat(formatEther(balance.value)).toFixed(3)} {balance.symbol}
          </span>
        )}
        <ChevronDown className={cn('w-3 h-3 text-mist transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 glass-panel p-2 z-50 border border-glass-border rounded-xl shadow-2xl">
          {isWrongChain && (
            <div className="px-3 py-2 mb-1 rounded-lg bg-rose-glow/10 text-rose-glow text-[10px]">
              Wrong network — switch to BSC Testnet
            </div>
          )}
          <div className="px-3 py-2 text-[10px] text-mist font-mono break-all">
            {address}
          </div>
          <button
            onClick={() => { disconnect(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-glow hover:bg-rose-glow/10 transition-colors"
            id="disconnect-wallet-btn"
          >
            <LogOut className="w-3 h-3" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
