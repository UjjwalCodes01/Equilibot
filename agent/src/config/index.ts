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
  MANAGED_SIGNER_PROVIDER: z.enum(['aws-kms']).default('aws-kms'),
  MANAGED_SIGNER_ADDRESS: addressSchema.optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_KMS_KEY_ID: z.string().min(1).optional(),
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

  // Phase 3: Execution mode ladder
  EXECUTION_MODE: z.enum(['observe', 'simulate', 'canary', 'active']).default('observe'),
  CANARY_MAX_TRADE_USD: z.coerce.number().min(1).default(50),
  RUNTIME_MAX_NOTIONAL_USD: z.coerce.number().min(0).default(0), // 0 = disabled

  // Autonomous strategy runner
  ENABLE_AUTONOMOUS_TASKS: z.coerce.boolean().default(true),
  AUTONOMOUS_TASK_TICK_MS: z.coerce.number().int().min(1000).default(15000),
  TASK_REBALANCE_INTERVAL_MS: z.coerce.number().int().min(30000).default(5 * 60 * 1000),
  TASK_REBALANCE_DRIFT_BPS: z.coerce.number().int().min(10).default(150),
  TASK_REBALANCE_SHARE_BPS: z.coerce.number().int().min(100).max(10000).default(3000),
  TASK_MIGRATION_INTERVAL_MS: z.coerce.number().int().min(60000).default(30 * 60 * 1000),
  TASK_ROUTE_IMPROVEMENT_BPS: z.coerce.number().int().min(1).default(25),
  TASK_MIGRATION_SHARE_BPS: z.coerce.number().int().min(100).max(10000).default(1000),
  TASK_BUYBACK_INTERVAL_MS: z.coerce.number().int().min(60000).default(45 * 60 * 1000),
  TASK_BUYBACK_MIN_STABLE_USD: z.coerce.number().int().min(1).default(250),
  TASK_BUYBACK_SHARE_BPS: z.coerce.number().int().min(100).max(10000).default(2000),
  TASK_BURN_ADDRESS: addressSchema.default('0x000000000000000000000000000000000000dEaD'),
  TASK_HARVEST_INTERVAL_MS: z.coerce.number().int().min(60 * 60 * 1000).default(24 * 60 * 60 * 1000),
  TASK_MIN_HARVEST_UNITS: z.coerce.bigint().min(1n).default(100000000000000000n),
  TASK_HARVEST_REINVEST_BPS: z.coerce.number().int().min(100).max(10000).default(6000),
  TASK_MAX_NOTIONAL_USD: z.coerce.number().int().min(1).default(1000),

  // Telemetry
  TELEMETRY_PORT: z.coerce.number().int().min(1024).max(65535).default(9100),
  TELEMETRY_BIND_ADDRESS: z.string().default('127.0.0.1'),
  TELEMETRY_ALLOWED_ORIGIN: z.string().default('http://localhost:3000'),
  TELEMETRY_API_TOKEN: z.string().min(16).optional(),

  // BNB Greenfield — decentralised audit log mirroring (optional; graceful degradation if not set)
  GREENFIELD_RPC_URL: z.string().url().optional(),
  GREENFIELD_PRIVATE_KEY: hexSchema.optional(),
  GREENFIELD_BUCKET: z.string().min(1).optional(),
  GREENFIELD_SP_ENDPOINT: z.string().url().optional(),
  GREENFIELD_CHAIN_ID: z.coerce.number().int().positive().optional(),

  // Alerting and runtime health monitoring
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_MIN_SEVERITY: z.enum(['info', 'warn', 'error', 'fatal']).default('warn'),
  ALERT_DEDUP_COOLDOWN_MS: z.coerce.number().int().min(1000).default(300000),
  ALERT_POLICY_REJECTION_WINDOW_MIN: z.coerce.number().int().min(1).default(10),
  ALERT_POLICY_REJECTION_THRESHOLD: z.coerce.number().int().min(1).default(5),
  ALERT_ORACLE_NULL_WINDOW_MIN: z.coerce.number().int().min(1).default(10),
  ALERT_ORACLE_NULL_THRESHOLD: z.coerce.number().int().min(1).default(5),
  ALERT_RPC_CHECK_INTERVAL_MS: z.coerce.number().int().min(5000).default(30000),
  ALERT_RPC_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
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

  if (parsed.SIGNER_MODE === 'managed' && parsed.MANAGED_SIGNER_PROVIDER === 'aws-kms') {
    if (!parsed.AWS_REGION) {
      extraErrors.push('AWS_REGION is required when SIGNER_MODE=managed and MANAGED_SIGNER_PROVIDER=aws-kms')
    }
    if (!parsed.AWS_KMS_KEY_ID) {
      extraErrors.push('AWS_KMS_KEY_ID is required when SIGNER_MODE=managed and MANAGED_SIGNER_PROVIDER=aws-kms')
    }
  }

  // Hard safety gates for mainnet operation.
  if (parsed.CHAIN_ID === 56 && parsed.SIGNER_MODE !== 'managed') {
    extraErrors.push('Mainnet requires SIGNER_MODE=managed (local private key signer is blocked)')
  }

  if (parsed.CHAIN_ID === 56 && !parsed.SECURITY_REVIEW_SIGNED_OFF) {
    extraErrors.push('Mainnet requires SECURITY_REVIEW_SIGNED_OFF=true before startup')
  }

  if (parsed.CHAIN_ID === 56 && (parsed.EXECUTION_MODE === 'canary' || parsed.EXECUTION_MODE === 'active')) {
    if (!parsed.ALERT_WEBHOOK_URL) {
      extraErrors.push('Mainnet canary/active requires ALERT_WEBHOOK_URL for incident alerting')
    }
    if (!parsed.TELEMETRY_API_TOKEN) {
      extraErrors.push('Mainnet canary/active requires TELEMETRY_API_TOKEN to secure telemetry endpoints')
    }
  }

  if (extraErrors.length > 0) {
    console.error(`\n❌ FATAL: Invalid production safety configuration:\n  ${extraErrors.join('\n  ')}\n`)
    process.exit(1)
  }

  _config = Object.freeze(parsed)
  return _config
}
