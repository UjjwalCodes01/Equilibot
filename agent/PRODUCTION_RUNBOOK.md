# EquiliBot Phase 2 Production Runbook

## 1) Non-Negotiable Gates
- Use `SIGNER_MODE=managed` on mainnet.
- Set `SECURITY_REVIEW_SIGNED_OFF=true` only after external reviewers approve.
- Ensure `MANAGED_SIGNER_ADDRESS` is exactly the `agent` configured on `EquiliBotModule`.

## 2) Real Mainnet Inputs
- Start from `.env.mainnet.example`.
- Fill project-specific values:
  - `RPC_HTTP_URL`
  - `RPC_WSS_URL`
  - `RPC_PRIVATE_URL`
  - `MANAGED_SIGNER_ADDRESS`
  - `SAFE_ADDRESS`
  - `MODULE_ADDRESS`
  - `GUARD_ADDRESS`

### Fast Environment Profile Switching
- For hackathon testnet profile:
  - `npm run env:use:testnet`
- For post-hackathon mainnet profile:
  - `npm run env:use:mainnet`
- Profile files used by these commands:
  - `.env.testnet.production`
  - `.env.mainnet.production`
- Optional local secret overlay for testnet:
  - `.env.testnet.local` is auto-appended when testnet profile is applied

## 3) How To Get RPC_WSS_URL
- Create a BSC Mainnet endpoint with a provider that supports WebSockets:
  - QuickNode
  - Alchemy
  - Ankr
  - Chainstack
- In provider dashboard:
  1. Create app/project.
  2. Select BNB Smart Chain Mainnet.
  3. Enable WebSocket endpoint.
  4. Copy the `wss://...` URL into `RPC_WSS_URL`.
- Validate endpoint quickly:
  - `cast block-number --rpc-url "$RPC_HTTP_URL"`
  - Start agent preflight via `npm run typecheck && npm run test` then runtime startup checks will validate WSS connectivity.

## 4) How To Get AGENT_PRIVATE_KEY
- For production mainnet, do not use raw private keys in the agent process.
- Use managed signer mode and leave `AGENT_PRIVATE_KEY` unset.

### If you need a local key for testnet only
- Generate a dedicated, isolated key:
  - `cast wallet new`
- Export only to local `.env` for testnet runs.
- Never reuse treasury owner keys.
- Never commit `.env` or key material.

## 5) Managed Signer Setup
- Provider decision: **AWS KMS**.
- Strategy decision: **native AWS KMS secp256k1 signing integrated into agent transaction path** (primary).
- Relay-based signing is fallback only.
- Required env for managed mode:
  - `MANAGED_SIGNER_PROVIDER=aws-kms`
  - `AWS_REGION`
  - `AWS_KMS_KEY_ID`
  - `RPC_PRIVATE_URL`
  - `MANAGED_SIGNER_ADDRESS`
- Expected health checks at startup:
  1. AWS KMS key must be enabled and `ECC_SECG_P256K1`.
  2. KMS public key must derive to `MANAGED_SIGNER_ADDRESS`.
  3. Agent address must match on-chain module `agent`.

## 6) Final Release Checks
- `npm run preflight:runtime`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run verify:kms` (managed mode only)
- `npm run drill:incident`
- Start agent with production `.env` and confirm preflight checks pass:
  - chain ID match
  - module/guard/router/factory/quoter bytecode present
  - WSS reachable
  - agent authorization and pause checks pass

## 7) Persistent Runtime (No Manual Shell Required)

### Docker Compose
- Files provided in repo:
  - `Dockerfile`
  - `docker-compose.yml`
- Start:
  - `docker compose up -d --build`
- Logs:
  - `docker compose logs -f equilibot-agent`
- Stop:
  - `docker compose down`

### PM2
- File provided in repo:
  - `ecosystem.config.cjs`
- Build once:
  - `npm run build`
- Start:
  - `pm2 start ecosystem.config.cjs`
- Logs:
  - `pm2 logs equilibot-agent`
- Persist across reboot:
  - `pm2 save && pm2 startup`

Both options run the same built artifact: `dist/index.js`.

## 8) Canary Switch Checklist (From Current Simulate State)

Only required deltas to move from `simulate` to `canary`:

### Required env delta
- Set `EXECUTION_MODE=canary`.

### Required on-chain delta
- None, if startup preflight already passes all checks:
  - `EquiliBotModule.agent == signer address`
  - `EquiliBotModule.paused == false`
  - `SwapGuard.paused == false`
  - Configured Safe/module/guard/router/factory/quoter addresses have bytecode

### Validation commands before flipping mode
- `npm run preflight:runtime`
- `npm run typecheck && npm run test`
- `npm run build && npm run start`

### Canary-specific runtime gates already enforced
- Trade submission is allowed only in `canary`/`active`.
- Canary notional cap is enforced with `CANARY_MAX_TRADE_USD`.
- Runtime notional cap is enforced with `RUNTIME_MAX_NOTIONAL_USD` when non-zero.
- Missing oracle price for notional checks fails closed.

## 9) Alerting Requirements (Production)
- Set `ALERT_WEBHOOK_URL` to an operations channel endpoint.
- Required monitored classes:
  - Circuit breaker trip
  - RPC degradation and recovery
  - Oracle availability spike
  - Policy rejection spike
- Tune alert thresholds via env:
  - `ALERT_POLICY_REJECTION_WINDOW_MIN`
  - `ALERT_POLICY_REJECTION_THRESHOLD`
  - `ALERT_ORACLE_NULL_WINDOW_MIN`
  - `ALERT_ORACLE_NULL_THRESHOLD`
  - `ALERT_RPC_CHECK_INTERVAL_MS`
  - `ALERT_RPC_FAILURE_THRESHOLD`

## 10) Soak Run Procedure (72 Hours)
- Run in long-lived host session:
  - `SOAK_HOURS=72 SOAK_MODE=canary npm run soak:run`
- Outputs:
  - `data/soak/soak-*.log`
  - `data/soak/soak-report-*.json`
- Exit evidence:
  - No unsafe execution behavior
  - Alerting path remains operational
  - Audit summary included in soak report

## 11) External Security Sign-Off Packet
- Complete and archive `SECURITY_REVIEW_SIGNOFF.md`.
- Attach:
  - Final security report and closure memo
  - Canary and soak evidence artifacts
  - Deployment addresses and commit hash reviewed

## 12) Incident Controls
- Keep pause authority operational for `SwapGuard` and `EquiliBotModule`.
- Keep private RPC failover documented.
- Rotate managed signer credentials by policy schedule.
