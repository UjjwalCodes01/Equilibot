# Agent Specification: EquiliBot Executive

## Overview
The EquiliBot Executive is the off-chain decision engine for autonomous treasury rebalancing on BNB Chain. It observes approved markets, computes deterministic rebalance opportunities, verifies them through simulation and policy, and then submits verified execution requests through Safe-controlled infrastructure.

## Agent Identity
The agent is not a free-form trader and not an unrestricted treasury signer.

The agent acts as:
- Observer of approved on-chain markets
- Strategy coordinator for rebalance intents
- Verifier through simulation workflows
- Proposal generator or constrained executor behind Safe and `SwapGuard`

## Cognitive Loop
The agent operates on an Observe, Calculate, Verify, Execute loop.

### 1. Observe
Purpose: Build a reliable market snapshot.

Inputs:
- Pool state from approved DEXs such as PancakeSwap and BiSwap
- Oracle prices from Pyth
- Gas estimates
- Treasury balances and policy configuration

Trigger examples:
- Slippage difference above configured basis points for a treasury-relevant trade size
- Net expected gain above minimum threshold after gas and fees
- Cooldown window elapsed for the same pair and route

### 2. Calculate
Purpose: Produce a deterministic candidate rebalance.

Responsibilities:
- Compare route quality across approved venues
- Estimate output, slippage, fees, and execution cost
- Size the rebalance using protocol-specific math or quote tooling
- Produce a structured intent containing route, amount, limits, expiry, and expected benefit

Important constraint:
- Use CLMM-aware quote logic for concentrated liquidity venues such as PancakeSwap V3
- Do not rely on simple constant-product math where it does not apply

### 3. Verify
Purpose: Reject unsafe or non-compliant intents before execution.

Checks:
- Fork simulation succeeds without revert
- Expected output remains within allowed bounds
- Net value remains positive after updated gas and fees
- Calldata satisfies `SwapGuard` policy
- Oracle price is fresh enough for policy comparison

Artifacts:
- Simulation report
- Verification decision
- Rejection reason when blocked

### 4. Execute
Purpose: Move only verified intents into the treasury execution path.

Execution modes:
- Submit a Safe transaction proposal for approval
- Trigger a constrained Safe module or executor if the treasury governance model allows it

Execution requirements:
- Include `minAmountOut`, deadline, route metadata, and policy-relevant parameters
- Record transaction hash, status, and settlement result
- Emit telemetry for both success and failure

## Tooling Contract
The agent should be built around a small set of deterministic tools:
- `get_market_snapshot(pairSet)`: returns normalized DEX and oracle state
- `quote_rebalance(intentInput)`: returns route options, size, expected output, and cost
- `simulate_intent(intent)`: returns execution success, output bounds, and failure details
- `validate_policy(intent)`: checks the intent against `SwapGuard` rules
- `submit_safe_transaction(intent)`: creates the Safe proposal or execution request
- `record_execution(result)`: persists audit and monitoring data

## Security Policy Alignment
The agent must assume the following controls exist outside itself:
- Safe is the treasury control plane
- `SwapGuard` is the on-chain policy boundary
- Allowlists and risk limits are externally configurable
- Pause controls can stop automated execution immediately

The agent must never:
- Sign arbitrary treasury transfers
- Trade on non-whitelisted routers
- Ignore stale oracle data
- Execute without simulation
- Bypass policy because a route looks profitable

## Output Model
Each agent decision should produce:
- A market context snapshot
- A candidate or rejected intent
- A simulation result
- A policy decision
- A final execution status or rejection reason

## Operator Visibility
Operators should be able to answer these questions from agent output:
- Why did the agent wake up?
- Why was this route chosen?
- What limits were applied?
- What simulation result was observed?
- Why was the action executed or rejected?
