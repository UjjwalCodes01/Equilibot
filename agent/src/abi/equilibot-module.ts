/**
 * EquiliBotModule ABI — executeSwap + admin reads.
 */
export const equiliBotModuleAbi = [
  {
    type: 'function',
    name: 'executeSwap',
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
      { name: 'routerCalldata', type: 'bytes' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'agent',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
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
    name: 'safe',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'guard',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'strictTokenIsolation',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'SwapExecuted',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'router', type: 'address', indexed: true },
      { name: 'tokenIn', type: 'address', indexed: true },
      { name: 'tokenOut', type: 'address', indexed: false },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'calldataHash', type: 'bytes32', indexed: false },
    ],
  },
] as const
