# EquiliBot Incident Runbook (Phase 3)

## Scope
This runbook covers runtime incidents for canary and active execution on BSC.

## Severity Levels
- SEV-1: Unsafe execution risk, policy bypass suspicion, signer compromise, or prolonged RPC outage.
- SEV-2: Repeated simulation/policy failures or degraded market connectivity.
- SEV-3: Non-critical telemetry or dashboard degradation.

## Detection Sources
- Webhook alerts from `ALERT_WEBHOOK_URL`.
- Telemetry endpoints: `/health`, `/api/status`, `/api/metrics`, `/api/audit`, `/api/policy`.
- Runtime logs from Docker/PM2.

## Immediate Containment
1. Pause execution on-chain:
   - Pause `SwapGuard`.
   - Pause `EquiliBotModule`.
2. Stop runtime process:
   - PM2: `pm2 stop equilibot-agent`
   - Docker: `docker compose stop equilibot-agent`
3. Confirm containment:
   - `module.paused == true`
   - `guard.paused == true`
   - No new `EXECUTED` entries in audit.

## Incident Classes

### Circuit Breaker Trip
- Trigger: `circuit-breaker-tripped` alert.
- Validate:
  - Check `/api/status` for `circuitBreaker.tripped`.
  - Review latest `SKIP`, `POLICY`, and `SIMULATION` events in audit.
- Recover:
  - Fix root cause.
  - Restart process.
  - Only unpause on-chain controls after verification.

### RPC Degradation
- Trigger: `rpc-degraded` alert.
- Validate:
  - Compare private/public RPC behavior.
  - Check block progression and error rates.
- Recover:
  - Switch to failover RPC endpoints.
  - Verify `rpc-recovered` alert before resuming canary/active.

### Oracle Availability Degradation
- Trigger: `oracle-unavailable-spike` alert.
- Validate:
  - Check Hermes health and feed freshness.
  - Confirm guard-oracle fallback behavior.
- Recover:
  - Keep module/guard paused if stale or missing oracle data persists.

### Policy Rejection Spike
- Trigger: `policy-rejection-spike` alert.
- Validate:
  - Aggregate recent rejection reasons from audit.
  - Confirm no unauthorized bypass path occurred.
- Recover:
  - Correct route, oracle, or config drift.
  - Resume only after rejection rate normalizes.

## Drill Procedure (Non-Destructive)
1. Ensure agent is running.
2. Run: `npm run drill:incident`
3. Optional alert path test:
   - `INCIDENT_DRILL_SEND_ALERT=true npm run drill:incident`
4. Archive generated JSON report from `data/drills/`.

## Evidence Requirements
- Telemetry snapshot from incident window.
- Audit summary for incident window.
- Root cause write-up and remediation commits.
- Explicit resume approval with timestamp and approver.
