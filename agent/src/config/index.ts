/**
 * EquiliBot Agent — Configuration Loader
 *
 * Uses Zod for runtime validation. If ANY required env var is missing
 * or malformed, the agent crashes immediately with a descriptive error.
 * No silent defaults for security-critical values.
 */

import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'
import { type Address, isAddress } from 'viem'

loadDotenv()

const addressSchema = z.string().refine(
  (val): val is Address => isAddress(val),
  { message: 'Invalid Ethereum address' }
)

const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid hex string')

const envSchema = z.object({
  // RPC
  RPC_HTTP_URL: z.string().url('RPC_HTTP_URL must be a valid URL'),
  RPC_WSS_URL: z.string().startsWith('wss://', 'RPC_WSS_URL must start with wss://'),
  RPC_PRIVATE_URL: z.string().url().optional(),
  CHAIN_ID: z
    .coerce
    .number()
    .int()
    .refine((chainId) => chainId === 56 || chainId === 97, 'CHAIN_ID must be 56 (BSC) or 97 (BSC testnet)'),

  // Agent wallet
  AGENT_PRIVATE_KEY: hexSchema.optional(),
  SIGNER_MODE: z.enum(['local', 'managed']).default('local'),
  MANAGED_SIGNER_ADDRESS: addressSchema.optional(),
  SECURITY_REVIEW_SIGNED_OFF: z.coerce.boolean().default(false),

  // Phase 1 contracts
  SAFE_ADDRESS: addressSchema,
  MODULE_ADDRESS: addressSchema,
  GUARD_ADDRESS: addressSchema,

  // PancakeSwap V3
  PANCAKE_V3_FACTORY: addressSchema,
  PANCAKE_SMART_ROUTER: addressSchema,
  PANCAKE_QUOTER_V2: addressSchema,

  // Pyth
  PYTH_HERMES_URL: z.string().url(),

  // Agent tuning
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  MIN_PROFIT_MULTIPLIER: z.coerce.number().min(1.0).default(1.5),
  MIN_DEVIATION_BPS: z.coerce.number().int().min(1).default(50),
  MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().min(1).default(5),
  SIMULATION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  MAX_GAS_PRICE_MULTIPLIER: z.coerce.number().min(1.0).default(3.0),
})

export type Config = z.infer<typeof envSchema>

let _config: Config | null = null

export function getConfig(): Config {
  if (_config) return _config

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    console.error(`\n❌ FATAL: Invalid agent configuration:\n${errors}\n`)
    process.exit(1)
  }

  const parsed = result.data
  const extraErrors: string[] = []

  if (parsed.SIGNER_MODE === 'local' && !parsed.AGENT_PRIVATE_KEY) {
    extraErrors.push('AGENT_PRIVATE_KEY is required when SIGNER_MODE=local')
  }

  if (parsed.SIGNER_MODE === 'managed' && !parsed.MANAGED_SIGNER_ADDRESS) {
    extraErrors.push('MANAGED_SIGNER_ADDRESS is required when SIGNER_MODE=managed')
  }

  if (parsed.SIGNER_MODE === 'managed' && !parsed.RPC_PRIVATE_URL) {
    extraErrors.push('RPC_PRIVATE_URL is required when SIGNER_MODE=managed')
  }

  // Hard safety gates for mainnet operation.
  if (parsed.CHAIN_ID === 56 && parsed.SIGNER_MODE !== 'managed') {
    extraErrors.push('Mainnet requires SIGNER_MODE=managed (local private key signer is blocked)')
  }

  if (parsed.CHAIN_ID === 56 && !parsed.SECURITY_REVIEW_SIGNED_OFF) {
    extraErrors.push('Mainnet requires SECURITY_REVIEW_SIGNED_OFF=true before startup')
  }

  if (extraErrors.length > 0) {
    console.error(`\n❌ FATAL: Invalid production safety configuration:\n  ${extraErrors.join('\n  ')}\n`)
    process.exit(1)
  }

  _config = Object.freeze(parsed)
  return _config
}
