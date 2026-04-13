# Development Guide: EquiliBot

## Project Context
EquiliBot is a BNB Chain treasury rebalancing system that detects liquidity inefficiencies, simulates corrective actions, and executes only policy-compliant swaps through Safe-controlled infrastructure.

## Product Goal
Reduce treasury trading slippage and improve route quality across approved DEXs without giving the agent unrestricted custody over funds.

## Architecture Summary
EquiliBot is built from four cooperating parts:
- Observation service for market data, oracle data, and trigger detection
- Strategy engine for deterministic pricing and intent generation
- Verification layer for simulation plus on-chain policy checks
- Execution layer built around Safe and guarded contract controls

## Technical Stack
- Frontend: Next.js 14+ with App Router, Tailwind CSS, Shadcn UI
- Agent Service: Node.js with TypeScript
- Web3: viem, wagmi, Safe{Core} SDK
- Contracts: Foundry-based Solidity contracts including `SwapGuard.sol` and, if used, `LiquidityVault.sol`
- Simulation: Anvil locally and optionally Tenderly for remote simulation workflows
- Oracle: Pyth Network for external price validation

## Development Principles
1. Math first, LLM second. Use deterministic market data and quote math before any model reasoning.
2. Safe is the control plane. The agent proposes or coordinates execution; it is not an unrestricted treasury signer.
3. Every automated action needs both off-chain verification and on-chain enforcement.
4. Prefer batched execution for `approve` plus `swap` when the route and guardrails allow it.
5. Keep policy explicit. Router allowlists, token allowlists, slippage limits, deadlines, and daily limits should exist in code and config.

## Component Map
- `/contracts`: On-chain policy and custody components such as `SwapGuard` and `LiquidityVault`
- `/src/agents`: Observe-calculate-verify orchestration and intent generation
- `/src/services`: DEX integrations, oracle access, simulation, and Safe submission logic
- `/src/hooks`: Frontend web3 hooks and contract read helpers
- `/src/components/dashboard`: Operator dashboard for policy state, intent history, simulations, and execution telemetry
- `/src/lib`: Shared types, route math, config loading, and logging utilities

## Contract Expectations
`SwapGuard.sol` should protect treasury actions with:
- Router and token allowlists
- Per-transaction and daily notional limits
- Slippage or price impact ceilings
- Oracle freshness checks
- Deadline validation
- Authorized caller restrictions
- Pause and emergency controls

`LiquidityVault.sol`, if included, should:
- Hold treasury assets or route them under Safe ownership
- Expose minimal interfaces needed for approved swaps
- Avoid embedding agent logic directly in custody code

## Agent Rules
- Do not treat LLM output as price truth.
- Do not execute unsimulated transactions.
- Do not bypass Safe or contract policy for convenience.
- Always attach execution bounds such as min out, deadline, and route metadata.
- Persist rationale and simulation results for auditability.

## Frontend Rules
- Show autonomous status clearly: observing, simulating, awaiting approval, executing, failed, paused
- Surface policy state from on-chain reads, not hardcoded UI assumptions
- Expose recent intents, approvals, rejections, and realized slippage savings

## Definition Of Done
A feature is only complete when:
- The architecture boundary is clear
- Policy enforcement exists on-chain or in explicit validated config
- Failure modes are observable
- Operators can explain why an intent was proposed, rejected, or executed
