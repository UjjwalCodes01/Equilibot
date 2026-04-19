/**
 * EquiliBot — Contract ABIs for frontend reads
 * Copied from agent/src/abi/ for direct viem usage.
 */

export const swapGuardAbi = [
  {
    type: 'function', name: 'paused', inputs: [],
    outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxSlippageBps', inputs: [],
    outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxDeadlineDelay', inputs: [],
    outputs: [{ name: '', type: 'uint64' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'cooldownSeconds', inputs: [],
    outputs: [{ name: '', type: 'uint64' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxOracleStaleness', inputs: [],
    outputs: [{ name: '', type: 'uint64' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxOracleDeviationBps', inputs: [],
    outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'defaultMaxDailyVolume', inputs: [],
    outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'owner', inputs: [],
    outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowedRouters',
    inputs: [{ name: 'router', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowedTokens',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'minTradeAmount',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxDailyVolumeByToken',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view',
  },
] as const

export const equiliBotModuleAbi = [
  {
    type: 'function', name: 'agent', inputs: [],
    outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'paused', inputs: [],
    outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'safe', inputs: [],
    outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'guard', inputs: [],
    outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'strictTokenIsolation', inputs: [],
    outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'owner', inputs: [],
    outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
  },
] as const
