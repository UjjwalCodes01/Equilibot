/**
 * EquiliBot — Formatting Utilities
 * Uses big.js for precise financial display math.
 */

import Big from 'big.js'

Big.DP = 8
Big.RM = Big.roundDown

export function formatTokenAmount(raw: string | bigint, decimals: number, maxDecimals = 4): string {
  try {
    const val = new Big(raw.toString()).div(new Big(10).pow(decimals))
    if (val.gte(1_000_000)) return `${val.div(1_000_000).toFixed(2)}M`
    if (val.gte(1_000)) return `${val.div(1_000).toFixed(2)}K`
    return val.toFixed(Math.min(maxDecimals, decimals))
  } catch {
    return '0.00'
  }
}

export function formatUSD(value: number | string | bigint): string {
  try {
    const num = typeof value === 'bigint' ? Number(value) : Number(value)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return '$0.00'
  }
}

export function formatBps(bps: number | string): string {
  const val = new Big(bps.toString()).div(100)
  return `${val.toFixed(2)}%`
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '—'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 0) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatSeconds(s: number | bigint): string {
  const sec = Number(s)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
