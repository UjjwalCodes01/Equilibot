/**
 * EquiliBot Agent — Balance Service
 *
 * Reads ERC-20 balances of the Safe for all tracked tokens.
 * Caches balances with block-number-based invalidation.
 */

import { type PublicClient, type Address, zeroAddress } from 'viem'
import { erc20Abi } from '../abi/erc20.js'
import { withRetry } from '../utils/retry.js'

interface CachedBalance {
  balance: bigint
  blockNumber: bigint
}

export class BalanceService {
  private readonly client: PublicClient
  private readonly safeAddress: Address
  private readonly cache = new Map<Address, CachedBalance>()

  constructor(client: PublicClient, safeAddress: Address) {
    this.client = client
    this.safeAddress = safeAddress
  }

  /**
   * Get the Safe's balance of a specific token.
   * Returns cached value if the block number hasn't changed.
   */
  async getBalance(token: Address, currentBlock?: bigint): Promise<bigint> {
    const block = currentBlock ?? (await this.client.getBlockNumber())

    const cached = this.cache.get(token)
    if (cached && cached.blockNumber >= block) {
      return cached.balance
    }

    let balance: bigint

    if (token === zeroAddress) {
      balance = await withRetry(
        () => this.client.getBalance({ address: this.safeAddress }),
        { label: `getBalance(native, ${this.safeAddress})` }
      )
    } else {
      balance = await withRetry(
        () =>
          this.client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [this.safeAddress],
          }),
        { label: `balanceOf(${token}, ${this.safeAddress})` }
      )
    }

    this.cache.set(token, { balance, blockNumber: block })

    return balance
  }

  /** Invalidate all cached balances (e.g., after a swap execution). */
  invalidateAll(): void {
    this.cache.clear()
  }

  /** Invalidate cached balance for a specific token. */
  invalidate(token: Address): void {
    this.cache.delete(token)
  }
}
