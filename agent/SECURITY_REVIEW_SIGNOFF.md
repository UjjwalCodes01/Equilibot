# Security Review Sign-Off

**Project:** EquiliBot Autonomous Treasury Agent
**Review Type:** Internal Self-Audit (Pre Third-Party Review)
**Date:** April 22, 2026
**Auditor:** EquiliBot Core Team
**Status:** ⚠️ INTERNAL AUDIT COMPLETE — Awaiting Third-Party External Review

---

> [!WARNING]
> This document records the results of an internal security self-audit. It is NOT a sign-off by an independent security firm. A third-party audit must be completed before mainnet deployment. The agent is approved for **BSC Testnet** demonstration only.

---

## Scope

| Component | Files Audited |
|-----------|--------------|
| On-chain policy enforcement | `contracts/src/SwapGuard.sol` |
| Safe module execution | `contracts/src/EquiliBotModule.sol` |
| Off-chain agent orchestration | `agent/src/index.ts`, `agent/src/strategy/` |
| Execution pipeline | `agent/src/services/execution-service.ts` |
| Oracle integration | `agent/src/services/oracle-service.ts`, `agent/src/services/guard-oracle-service.ts` |
| Audit persistence | `agent/src/services/audit-store.ts` |

---

## Findings Summary

### Critical (0 open)
_No critical findings._

### High (0 open)
_No high-severity findings._

### Medium (2 resolved)

| ID | Title | Status |
|----|-------|--------|
| M-001 | Stablecoin oracle staleness on BSC Testnet caused agent stalls | ✅ Resolved — synthetic $1.00 fallback implemented in `buildSnapshot()` |
| M-002 | Buyback & Burn: burn settlement was hardcoded as `'queued'` — never executed on-chain | ✅ Resolved — `executeBurnTransfer()` added to `ExecutionService`; called atomically after swap |

### Low (3 resolved)

| ID | Title | Status |
|----|-------|--------|
| L-001 | AI API endpoints had no authentication — Gemini quota exposed | ✅ Resolved — Bearer token auth + IP rate limiting added to all `/api/ai/*` routes |
| L-002 | Frontend Sandbox page used `Math.random()` for backtest results | ✅ Resolved — replaced with real agent telemetry audit log replay |
| L-003 | Frontend Lifecycle page used static Gaussian mock for liquidity chart | ✅ Resolved — replaced with live pool tick distribution from agent telemetry |

### Informational (2 open)

| ID | Title | Status |
|----|-------|--------|
| I-001 | `AGENT_PRIVATE_KEY` stored in plaintext `.env` on testnet | ⚠️ Accepted for testnet. Mainnet requires `SIGNER_MODE=managed` (AWS KMS) — enforced at startup. |
| I-002 | BNB Greenfield uploader gracefully degrades when not configured | ⚠️ Accepted. Uploader warns at startup; local NDJSON is always written first. |

---

## Security Controls Verified

### On-Chain (`SwapGuard.sol` + `EquiliBotModule.sol`)

- [x] **Reentrancy guard** — `nonReentrant` applied to `executeSwap`
- [x] **Token allowlist** — only pre-approved tokens can be used as tokenIn/tokenOut
- [x] **Router allowlist** — only pre-approved routers and function selectors accepted
- [x] **Volume limit** — per-token daily volume enforced via `SwapGuard.validateAndConsume`
- [x] **Slippage bounds** — `minAmountOut` validated against oracle price with configurable deviation BPS
- [x] **Oracle staleness** — Pyth feed age enforced (`MAX_ORACLE_STALENESS_SECONDS`)
- [x] **Balance delta verification** — post-swap balance checked against declared `minAmountOut`
- [x] **Cooldown enforcement** — per-token cooldown prevents high-frequency abuse
- [x] **Strict token isolation** — treasury tokens tracked; unregistered tokens cannot be touched
- [x] **Calldata hash validation** — `routerCalldata` hash checked before dispatch

### Off-Chain (Agent)

- [x] **Observe → Calculate → Verify → Execute loop** — no execution without full pipeline
- [x] **Simulation gate** — every intent `eth_call` simulated before live submission
- [x] **Runtime policy** — `validatePreSubmit` enforces deadline, oracle staleness, canary caps
- [x] **Circuit breaker** — automatic halt after consecutive failures
- [x] **Execution mode ladder** — `observe` → `simulate` → `canary` → `active` (config-gated)
- [x] **Mainnet locks** — `CHAIN_ID=56` requires `SIGNER_MODE=managed` + `SECURITY_REVIEW_SIGNED_OFF=true`

---

## Test Coverage

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| SwapGuard | `contracts/test/SwapGuard.t.sol` | 25+ Foundry tests | ✅ Passing |
| EquiliBotModule | `contracts/test/EquiliBotModule.t.sol` | 40+ Foundry tests | ✅ Passing |
| Oracle Adapter | `contracts/test/ChainlinkPriceOracleAdapter.t.sol` | 10+ tests | ✅ Passing |
| Rebalance Detector | `agent/src/strategy/rebalance-detector.test.ts` | 12 tests | ✅ Passing |
| Runtime Policy | `agent/src/strategy/runtime-policy.test.ts` | 11 tests | ✅ Passing |
| Profitability | `agent/src/strategy/profitability.test.ts` | 8 tests | ✅ Passing |
| Autonomous Task Runner | `agent/src/strategy/autonomous-task-runner.test.ts` | 14 tests | ✅ Added April 22, 2026 |

---

## Deployment Approval

| Environment | Approved | Conditions |
|-------------|----------|------------|
| **BSC Testnet** | ✅ **YES** | Execution mode `canary` or lower. Alert webhook required. |
| **BSC Mainnet** | ❌ **NO** | Requires independent third-party audit report + `SECURITY_REVIEW_SIGNED_OFF=true` |

---

## Next Steps Before Mainnet

1. Engage an independent audit firm (e.g., Trail of Bits, Halborn, Certik)
2. Complete formal verification of `SwapGuard.validateAndConsume` invariants
3. Deploy to BSC Testnet and run 7-day soak test at `canary` mode
4. Obtain sign-off from a DAO multisig before enabling `active` mode on mainnet
