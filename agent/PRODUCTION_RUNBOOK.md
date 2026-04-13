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
- Typical setup:
  1. Create signer in KMS/HSM (or managed wallet service).
  2. Expose signing via private RPC / relay.
  3. Set signer address as module `agent` on chain.
  4. Put relay endpoint in `RPC_PRIVATE_URL`.
  5. Set `SIGNER_MODE=managed` and `MANAGED_SIGNER_ADDRESS`.

## 6) Final Release Checks
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- Start agent with production `.env` and confirm preflight checks pass:
  - chain ID match
  - module/guard/router/factory/quoter bytecode present
  - WSS reachable
  - agent authorization and pause checks pass

## 7) Incident Controls
- Keep pause authority operational for `SwapGuard` and `EquiliBotModule`.
- Keep private RPC failover documented.
- Rotate managed signer credentials by policy schedule.
