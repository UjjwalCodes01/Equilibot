/**
 * Contract address constants and chain-specific configuration.
 */

import { type Address } from 'viem'
import { getConfig } from './index.js'

export interface ContractAddresses {
  readonly safe: Address
  readonly module: Address
  readonly guard: Address
  readonly pancakeV3Factory: Address
  readonly pancakeSmartRouter: Address
  readonly pancakeQuoterV2: Address
}

export function getAddresses(): ContractAddresses {
  const config = getConfig()
  return {
    safe: config.SAFE_ADDRESS as Address,
    module: config.MODULE_ADDRESS as Address,
    guard: config.GUARD_ADDRESS as Address,
    pancakeV3Factory: config.PANCAKE_V3_FACTORY as Address,
    pancakeSmartRouter: config.PANCAKE_SMART_ROUTER as Address,
    pancakeQuoterV2: config.PANCAKE_QUOTER_V2 as Address,
  }
}
