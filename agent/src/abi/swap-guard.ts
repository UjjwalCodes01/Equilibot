/**
 * SwapGuard ABI — mirrors ISwapGuard + admin read functions.
 */
export const swapGuardAbi = [
  {
    type: 'function',
    name: 'checkSwap',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'swapType', type: 'uint8' },
          { name: 'router', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'expectedAmountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'expectedAmountOut', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'agent', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxSlippageBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxDeadlineDelay',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'cooldownSeconds',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'minTradeAmount',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxTradeAmountByToken',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxDailyVolumeByToken',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'dailyVolumeByAgentToken',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'dayKey', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lastExecutionAtByToken',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowedRouters',
    inputs: [{ name: 'router', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowedTokens',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const
