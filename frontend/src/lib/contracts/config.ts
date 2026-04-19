/**
 * EquiliBot — Wagmi / Viem Configuration
 */

import { http, createConfig } from 'wagmi'
import { type Chain } from 'wagmi/chains'

export const bscTestnet: Chain = {
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_BNB_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
}

export const bscMainnet: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_BNB_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
}

export const wagmiConfig = createConfig({
  chains: [bscTestnet, bscMainnet],
  transports: {
    [bscTestnet.id]: http(),
    [bscMainnet.id]: http(),
  },
  ssr: true,
})

// ─── Contract Addresses (from .env.local) ────────────────────
export const CONTRACT_ADDRESSES = {
  safe: (process.env.NEXT_PUBLIC_SAFE_ADDRESS || '0x19223058050D2C91E6e42158f0760340Fb3D41C3') as `0x${string}`,
  module: (process.env.NEXT_PUBLIC_MODULE_ADDRESS || '0xe963752aD278ff5185e16C46bB75C6c8b87641D6') as `0x${string}`,
  guard: (process.env.NEXT_PUBLIC_GUARD_ADDRESS || '0xba6c8EEaDB62Dc0302bEBb3d80C0AEA459af2Dc1') as `0x${string}`,
} as const

export const EXPLORER_TX_URL = process.env.NEXT_PUBLIC_BSCSCAN_TX_BASE_URL || 'https://testnet.bscscan.com/tx/'

// Known token addresses
export const TOKENS = {
  WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' as `0x${string}`,
  BUSD: '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee' as `0x${string}`,
} as const
