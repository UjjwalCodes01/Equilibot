"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbi, type Address, type PublicClient } from "viem";

export type DashboardRouteKey =
  | "nexus"
  | "liquidity-topology"
  | "strategy-studio"
  | "treasury-health"
  | "simulation-sandbox"
  | "governance-audit"
  | "safety-vault"
  | "incentive-arbitrage-map"
  | "agent-identity"
  | "terminal";

export type AgentLogEntry = {
  timestamp: string;
  level: "trace" | "debug" | "info" | "warn" | "error";
  message: string;
  component?: string;
  details?: string;
};

export type ThoughtStep = {
  label: string;
  state: "observe" | "calculate" | "verify" | "execute" | "complete";
  detail?: string;
  timestamp?: string;
};

export type NexusData = {
  status?: string;
  heartbeat?: string;
  thoughtSteps?: ThoughtStep[];
  logs?: AgentLogEntry[];
  graphLabel?: string;
};

export type LiquidityNode = {
  id: string;
  label: string;
  dex?: string;
  x: number;
  y: number;
  z?: number;
  weight?: number;
};

export type LiquidityLink = {
  source: string;
  target: string;
  intensity?: number;
};

export type LiquidityTopologyData = {
  nodes?: LiquidityNode[];
  links?: LiquidityLink[];
  chainLabel?: string;
  subtitle?: string;
};

export type StrategyControl = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  note?: string;
};

export type StrategyStudioData = {
  controls?: StrategyControl[];
  summary?: string;
  guardLabels?: string[];
  activeSwap?: SwapIntent;
  swapHistory?: SwapIntent[];
};

export type TreasuryMetric = {
  label: string;
  value: number;
  unit?: string;
  trend?: number;
};

export type TreasuryHealthData = {
  metrics?: TreasuryMetric[];
  slippageSeries?: Array<{ timestamp: string; value: number }>;
  efficiencySeries?: Array<{ timestamp: string; value: number }>;
  ilMitigationSeries?: Array<{ timestamp: string; value: number }>;
};

export type SimulationRun = {
  id: string;
  chainFork?: string;
  status: "queued" | "running" | "complete" | "rejected";
  executedAt?: string;
  before?: Array<{ label: string; amount: number; symbol: string }>;
  after?: Array<{ label: string; amount: number; symbol: string }>;
  reason?: string;
};

export type SimulationSandboxData = {
  runs?: SimulationRun[];
  forkLabel?: string;
  windowLabel?: string;
};

export type AuditEntry = {
  id: string;
  txHash?: string;
  status: "proposed" | "rejected" | "executed" | "simulated";
  summary: string;
  proofOfIntent?: string;
  timestamp: string;
};

export type GovernanceAuditData = {
  entries?: AuditEntry[];
  selectedEntryId?: string;
};

export type VaultPermission = {
  label: string;
  enabled: boolean;
  detail?: string;
};

export type SafetyVaultData = {
  killSwitch?: "armed" | "disarmed" | "paused";
  permissions?: VaultPermission[];
  guardrails?: Array<{ label: string; value: string }>;
};

export type ArbitrageHeatCell = {
  id: string;
  label: string;
  intensity: number;
  pool?: string;
};

export type IncentiveArbitrageData = {
  cells?: ArbitrageHeatCell[];
  chainLabel?: string;
  updatedAt?: string;
};

export type Token = {
  symbol: string;
  address: string;
  decimals: number;
  balance?: string;
};

export type DEXRoute = {
  id: string;
  dex: string;
  path: Token[];
  gasEstimate?: number;
  priceImpact?: number;
};

export type SwapQuote = {
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  priceImpact: number;
  route: DEXRoute;
  updatedAt: string;
};

export type SwapIntent = {
  id: string;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  quote?: SwapQuote;
  slippageTolerance: number;
  status: "draft" | "simulating" | "simulated" | "executing" | "executed" | "rejected";
  safeTransactionHash?: string;
  onChainTxHash?: string;
  reason?: string;
  createdAt: string;
};

export type IdentityMetric = {
  label: string;
  value: string;
};

export type AgentIdentityData = {
  passportId?: string;
  reputationScore?: number;
  uptime?: string;
  metrics?: IdentityMetric[];
  attestations?: string[];
};

export type TerminalEntry = AgentLogEntry & {
  latencyMs?: number;
};

export type TerminalData = {
  entries?: TerminalEntry[];
  health?: Array<{ label: string; value: string }>;
};

export type DashboardData = Partial<{
  nexus: NexusData;
  liquidityTopology: LiquidityTopologyData;
  strategyStudio: StrategyStudioData;
  treasuryHealth: TreasuryHealthData;
  simulationSandbox: SimulationSandboxData;
  governanceAudit: GovernanceAuditData;
  safetyVault: SafetyVaultData;
  incentiveArbitrageMap: IncentiveArbitrageData;
  agentIdentity: AgentIdentityData;
  terminal: TerminalData;
}>;

type TelemetryStatus = {
  executionMode?: string;
  chainId?: number;
  pairsWatched?: number;
  uptime?: number;
  circuitBreaker?: {
    tripped?: boolean;
    consecutiveFailures?: number;
    tripReason?: string | null;
    trippedAt?: string | null;
  };
};

type TelemetryMetrics = {
  uptime?: number;
  pipelineRuns?: number;
  opportunitiesDetected?: number;
  simulationsRun?: number;
  simulationsPassed?: number;
  simulationsFailed?: number;
  policyChecksPassed?: number;
  policyChecksFailed?: number;
  executionsAttempted?: number;
  executionsSucceeded?: number;
  executionsFailed?: number;
  skips?: Record<string, number>;
  lastPipelineRunAt?: number | null;
  lastExecutionAt?: number | null;
};

type TelemetryAuditResponse = {
  date?: string;
  limit?: number;
  offset?: number;
  count?: number;
  entries?: Array<{
    timestamp: string;
    intentId: string;
    stage: string;
    pair: string;
    data: Record<string, unknown>;
  }>;
};

type TelemetryPolicy = Record<string, unknown> & {
  cachedAt?: number;
};

type TelemetryTaskStatusResponse = {
  enabled?: boolean;
  tasks?: Array<{
    taskId: string;
    state: string;
    lastRunAt: number | null;
    nextRunAt: number | null;
    lastMessage: string | null;
    txHash: string | null;
  }>;
};

type LiveElizaLog = {
  timestamp: string;
  level: string;
  component?: string;
  stage?: string;
  message: string;
};

const SWAP_GUARD_ABI = parseAbi([
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",
  "function defaultMaxDailyVolume() view returns (uint256)",
  "function cooldownSeconds() view returns (uint64)",
  "function maxDeadlineDelay() view returns (uint64)",
  "function maxOracleStaleness() view returns (uint64)",
  "function maxOracleDeviationBps() view returns (uint16)",
  "function maxSlippageBps() view returns (uint16)",
  "function maxExactOutputInputBufferBps() view returns (uint16)",
  "function requireExplicitTokenLimits() view returns (bool)",
  "function oracle() view returns (address)",
]);

const SAFE_ABI = parseAbi([
  "function isModuleEnabled(address) view returns (bool)",
]);

const PUBLIC_GUARD_ADDRESS = process.env.NEXT_PUBLIC_GUARD_ADDRESS;
const PUBLIC_SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS;
const PUBLIC_MODULE_ADDRESS = process.env.NEXT_PUBLIC_MODULE_ADDRESS;

const EMPTY_DASHBOARD: DashboardData = {};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function toText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}

function asAddress(value: unknown): Address | undefined {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : undefined;
}

function collectAuditEntries(audit: TelemetryAuditResponse | null | undefined): AuditEntry[] {
  return (audit?.entries ?? []).map((entry, index) => ({
    id: `${entry.timestamp}-${index}`,
    timestamp: entry.timestamp,
    txHash: toText(entry.data.txHash ?? entry.data.routerCalldataHash),
    status:
      entry.stage === "INTENT"
        ? "proposed"
        : entry.stage === "POLICY"
          ? "simulated"
          : entry.stage === "SIMULATION"
            ? "simulated"
            : entry.stage === "EXECUTION"
              ? ((entry.data.status as string) === "EXECUTED" ? "executed" : "rejected")
              : "rejected",
    summary: `${entry.stage} · ${entry.pair}`,
    proofOfIntent:
      entry.stage === "INTENT"
        ? JSON.stringify(entry.data, null, 2)
        : entry.stage === "POLICY"
          ? JSON.stringify(entry.data, null, 2)
          : undefined,
  }));
}

function collectThoughtSteps(audit: TelemetryAuditResponse | null | undefined, status: TelemetryStatus | null | undefined): ThoughtStep[] {
  const recentEntries = (audit?.entries ?? []).slice(-8);
  const steps: ThoughtStep[] = [];

  if (status?.executionMode) {
    steps.push({
      label: `Execution mode ${status.executionMode}`,
      state: "observe",
      detail: `Chain ${status.chainId ?? "unknown"}, pairs watched ${status.pairsWatched ?? 0}`,
      timestamp: status.uptime ? `${Math.floor(status.uptime / 1000)}s uptime` : undefined,
    });
  }

  for (const entry of recentEntries) {
    const state =
      entry.stage === "OPPORTUNITY"
        ? "observe"
        : entry.stage === "INTENT"
          ? "calculate"
          : entry.stage === "POLICY"
            ? "verify"
            : entry.stage === "SIMULATION"
              ? "verify"
              : entry.stage === "EXECUTION"
                ? "execute"
                : "complete";

    const detail =
      entry.stage === "SKIP"
        ? toText(entry.data.reason)
        : entry.stage === "POLICY"
          ? `Policy ${toText(entry.data.passed) ?? "unknown"}`
          : entry.stage === "SIMULATION"
            ? `Simulation ${toText(entry.data.success) ?? "unknown"}`
            : entry.stage === "EXECUTION"
              ? toText(entry.data.status)
              : undefined;

    steps.push({
      label: `${entry.stage} · ${entry.pair}`,
      state,
      detail,
      timestamp: entry.timestamp,
    });
  }

  return steps.slice(-10);
}

function buildTreasuryMetrics(metrics: TelemetryMetrics | null | undefined, audit: TelemetryAuditResponse | null | undefined): TreasuryMetric[] {
  const totalSkips = Object.values(metrics?.skips ?? {}).reduce((sum, value) => sum + value, 0);
  const rejected = (audit?.entries ?? []).filter((entry) => entry.stage === "SKIP" || (entry.stage === "POLICY" && entry.data.passed === false)).length;

  return [
    { label: "Pipeline runs", value: metrics?.pipelineRuns ?? 0 },
    { label: "Opportunities", value: metrics?.opportunitiesDetected ?? 0 },
    { label: "Simulations", value: metrics?.simulationsRun ?? 0 },
    { label: "Policy passes", value: metrics?.policyChecksPassed ?? 0 },
    { label: "Executions", value: metrics?.executionsSucceeded ?? 0 },
    { label: "Skips", value: totalSkips },
    { label: "Rejected decisions", value: rejected },
  ];
}

function buildAuditTrend(audit: TelemetryAuditResponse | null | undefined, field: string): Array<{ timestamp: string; value: number }> {
  return (audit?.entries ?? [])
    .filter((entry) => entry.data[field] !== undefined)
    .slice(-12)
    .map((entry) => ({
      timestamp: entry.timestamp.slice(11, 16),
      value: Number(entry.data[field] ?? 0),
    }));
}

function buildLiquidityTopology(policy: TelemetryPolicy | null | undefined): LiquidityTopologyData | undefined {
  const pools = Array.isArray(policy?.pools) ? (policy.pools as Array<Record<string, unknown>>) : [];
  const routers = Array.isArray(policy?.routers) ? (policy.routers as Array<Record<string, unknown>>) : [];
  const nodes: LiquidityNode[] = [];
  const links: LiquidityLink[] = [];

  for (const [index, router] of routers.entries()) {
    const address = asAddress(router.address ?? router.router ?? router.value);
    if (!address) continue;
    nodes.push({
      id: address,
      label: toText(router.label ?? router.name) ?? `Router ${index + 1}`,
      dex: toText(router.dex ?? router.source),
      x: 15 + (index * 17) % 70,
      y: 24 + (index * 29) % 62,
      z: 55 + (index * 7) % 35,
      weight: Number(router.weight ?? index + 1),
    });
  }

  for (const [index, pool] of pools.entries()) {
    const id = toText(pool.address ?? pool.poolAddress ?? pool.id);
    if (!id) continue;
    nodes.push({
      id,
      label: toText(pool.label ?? pool.name) ?? `Pool ${index + 1}`,
      dex: toText(pool.dex ?? pool.router ?? pool.protocol),
      x: 30 + (index * 19) % 65,
      y: 18 + (index * 21) % 68,
      z: 45 + (index * 9) % 40,
      weight: Number(pool.weight ?? 1),
    });
  }

  const nodeIds = nodes.map((node) => node.id);
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    links.push({ source: nodeIds[index]!, target: nodeIds[index + 1]!, intensity: 0.45 + ((index % 5) * 0.1) });
  }

  if (!nodes.length) {
    return undefined;
  }

  return {
    nodes,
    links,
    chainLabel: toText(policy?.chainName) ?? "BNB Chain",
    subtitle: "Live router and pool topology sourced from telemetry policy state",
  };
}

function buildStrategyStudio(policy: TelemetryPolicy | null | undefined): StrategyStudioData | undefined {
  if (!policy) return undefined;

  return {
    controls: [
      {
        id: "slippage",
        label: "Max slippage",
        value: Number(policy.maxSlippageBps ?? 0),
        min: 0,
        max: 1000,
        step: 1,
        suffix: "bps",
        note: "Directly mapped from SwapGuard maxSlippageBps",
      },
      {
        id: "deadline",
        label: "Deadline delay",
        value: Number(policy.maxDeadlineDelay ?? 0),
        min: 0,
        max: 3600,
        step: 30,
        suffix: "s",
        note: "Guard deadline window in seconds",
      },
      {
        id: "cooldown",
        label: "Cooldown",
        value: Number(policy.cooldownSeconds ?? 0),
        min: 0,
        max: 86400,
        step: 60,
        suffix: "s",
        note: "Token execution cooldown window",
      },
    ],
    summary: toText(policy.summary) ?? "Live policy inputs loaded from telemetry",
    guardLabels: [
      toText(policy.guardName) ?? "SwapGuard",
      toText(policy.routerLabel) ?? "Router allowlist",
      toText(policy.tokenLabel) ?? "Token allowlist",
    ].filter((value): value is string => Boolean(value)),
  };
}

function buildSimulationSandbox(audit: TelemetryAuditResponse | null | undefined): SimulationSandboxData | undefined {
  const entries = audit?.entries ?? [];
  const runs = entries
    .filter((entry) => ["INTENT", "POLICY", "SIMULATION", "EXECUTION"].includes(entry.stage))
    .slice(-8)
    .map<SimulationRun>((entry, index) => ({
      id: entry.intentId || `${entry.stage}-${index}`,
      chainFork: "BNB testnet fork",
      status:
        entry.stage === "SIMULATION"
          ? (entry.data.success === true ? "complete" : "rejected")
          : entry.stage === "EXECUTION"
            ? (entry.data.status === "EXECUTED" ? "complete" : "rejected")
            : entry.stage === "INTENT"
              ? "queued"
              : "running",
      executedAt: entry.timestamp,
      reason: entry.stage === "POLICY" ? toText(entry.data.error) : entry.stage === "SIMULATION" ? toText(entry.data.revertReason) : undefined,
      before: entry.stage === "INTENT"
        ? [
            { label: "Amount in", amount: Number(entry.data.amountIn ?? 0), symbol: "wei" },
            { label: "Expected out", amount: Number(entry.data.expectedAmountOut ?? 0), symbol: "wei" },
          ]
        : undefined,
      after: entry.stage === "SIMULATION"
        ? [
            { label: "Token delta", amount: Number(entry.data.balanceOutDelta ?? 0), symbol: "wei" },
            { label: "Gas used", amount: Number(entry.data.gasUsed ?? 0), symbol: "wei" },
          ]
        : undefined,
    }));

  if (!runs.length) return undefined;

  return {
    runs,
    forkLabel: "Mainnet fork replay sourced from audit trail",
    windowLabel: "Last 24 hours",
  };
}

function buildSafetyVault(policy: TelemetryPolicy | null | undefined): SafetyVaultData | undefined {
  if (!policy) return undefined;

  return {
    killSwitch: policy.paused === true ? "paused" : "disarmed",
    permissions: [
      { label: "Guard owner", enabled: Boolean(policy.owner), detail: toText(policy.owner) },
      { label: "Guard active", enabled: Boolean(policy.guardAddress), detail: toText(policy.guardAddress) },
      { label: "Safe active", enabled: Boolean(policy.safeAddress), detail: toText(policy.safeAddress) },
    ],
    guardrails: [
      { label: "Max slippage", value: `${toText(policy.maxSlippageBps) ?? "0"} bps` },
      { label: "Deadline delay", value: `${toText(policy.maxDeadlineDelay) ?? "0"} s` },
      { label: "Cooldown", value: `${toText(policy.cooldownSeconds) ?? "0"} s` },
      { label: "Oracle staleness", value: `${toText(policy.maxOracleStaleness) ?? "0"} s` },
    ],
  };
}

function buildIdentity(status: TelemetryStatus | null | undefined, metrics: TelemetryMetrics | null | undefined, audit: TelemetryAuditResponse | null | undefined): AgentIdentityData | undefined {
  if (!status && !metrics) return undefined;

  const uptimeHours = status?.uptime ? (status.uptime / 3600000).toFixed(1) : "0.0";
  const successRate = metrics && metrics.executionsAttempted ? ((metrics.executionsSucceeded ?? 0) / metrics.executionsAttempted * 100).toFixed(1) : "0.0";

  return {
    passportId: `BAP-578 · ${status?.chainId ?? "unknown"}`,
    reputationScore: Math.max(0, Math.min(100, Math.round(Number(successRate)) + Math.min(15, Number(uptimeHours)))),
    uptime: `${uptimeHours}h observed on ${status?.chainId ?? "unknown chain"}`,
    metrics: [
      { label: "Execution success", value: `${successRate}%` },
      { label: "Last execution", value: status?.circuitBreaker?.trippedAt ?? "none" },
      { label: "Decision records", value: String(audit?.entries?.length ?? 0) },
    ],
    attestations: [
      status?.executionMode ? `Mode: ${status.executionMode}` : undefined,
      status?.circuitBreaker?.tripped ? "Circuit breaker active" : "Circuit breaker nominal",
    ].filter((value): value is string => Boolean(value)),
  };
}

function buildTerminal(status: TelemetryStatus | null | undefined, metrics: TelemetryMetrics | null | undefined, logs: LiveElizaLog[] | null | undefined): TerminalData | undefined {
  const entries = (logs ?? []).slice(-25).map<TerminalEntry>((log, index) => ({
    timestamp: log.timestamp,
    level: (log.level as TerminalEntry["level"]) ?? "info",
    message: log.message,
    component: log.component,
    details: log.stage,
    latencyMs: 3 + (index % 11),
  }));

  const health = [
    { label: "Mode", value: status?.executionMode ?? "unknown" },
    { label: "Chain", value: String(status?.chainId ?? "unknown") },
    { label: "Pipeline runs", value: String(metrics?.pipelineRuns ?? 0) },
    { label: "Executions", value: String(metrics?.executionsAttempted ?? 0) },
  ];

  return { entries, health };
}

function isAddressLike(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function fetchLiveSnapshot(publicClient: PublicClient | null): Promise<DashboardData> {
  const [status, metrics, audit, policy, logs, taskStatus] = await Promise.all([
    fetchJson<TelemetryStatus>("/api/agent/api/status"),
    fetchJson<TelemetryMetrics>("/api/agent/api/metrics"),
    fetchJson<TelemetryAuditResponse>("/api/agent/api/audit?limit=100&offset=0"),
    fetchJson<TelemetryPolicy>("/api/agent/api/policy"),
    fetchJson<{ entries?: LiveElizaLog[] }>("/api/eliza/logs?limit=120"),
    fetchJson<TelemetryTaskStatusResponse>("/api/agent/tasks/status"),
  ]);

  const auditEntries = collectAuditEntries(audit);
  const dashboard: DashboardData = {
    nexus: {
      status: status?.executionMode ? `Live ${status.executionMode}` : "Awaiting telemetry",
      heartbeat: status?.uptime ? `${Math.floor((status.uptime ?? 0) / 1000)}s uptime` : "Heartbeat pending",
      graphLabel: "ElizaOS stream",
      logs: (logs?.entries ?? []).map((entry) => ({
        timestamp: entry.timestamp,
        level: (entry.level as AgentLogEntry["level"]) ?? "info",
        component: entry.component,
        message: entry.message,
        details: entry.stage,
      })),
      thoughtSteps: collectThoughtSteps(audit, status),
    },
    liquidityTopology: buildLiquidityTopology(policy),
    strategyStudio: buildStrategyStudio(policy),
    treasuryHealth: {
      metrics: buildTreasuryMetrics(metrics, audit),
      slippageSeries: buildAuditTrend(audit, "estimatedProfit"),
      efficiencySeries: buildAuditTrend(audit, "gasUsed"),
      ilMitigationSeries: buildAuditTrend(audit, "deviationBps"),
    },
    simulationSandbox: buildSimulationSandbox(audit),
    governanceAudit: {
      entries: auditEntries,
      selectedEntryId: auditEntries.at(-1)?.id,
    },
    safetyVault: buildSafetyVault(policy),
    incentiveArbitrageMap: {
      chainLabel: "BNB Chain",
      updatedAt: audit?.date ?? new Date().toISOString(),
      cells: (audit?.entries ?? [])
        .filter((entry) => entry.stage === "OPPORTUNITY")
        .slice(-8)
        .map((entry, index) => ({
          id: `${entry.timestamp}-${index}`,
          label: entry.pair,
          intensity: Number(entry.data.deviationBps ?? 0),
          pool: toText(entry.data.direction),
        })),
    },
    agentIdentity: buildIdentity(status, metrics, audit),
    terminal: buildTerminal(status, metrics, logs?.entries ?? []),
  };

  if (!dashboard.incentiveArbitrageMap?.cells?.length && taskStatus?.enabled && taskStatus.tasks?.length) {
    dashboard.incentiveArbitrageMap = {
      chainLabel: "BNB Chain",
      updatedAt: new Date().toISOString(),
      cells: taskStatus.tasks.slice(0, 8).map((task, index) => ({
        id: `${task.taskId}-${index}`,
        label: task.taskId,
        intensity: task.state === "RUNNING" ? 90 : task.state === "EXECUTED" ? 70 : task.state === "REJECTED" ? 50 : 30,
        pool: task.lastMessage ?? task.state,
      })),
    };
  }

  if (!dashboard.incentiveArbitrageMap?.cells?.length && status) {
    dashboard.incentiveArbitrageMap = {
      chainLabel: `BNB Chain (${status.executionMode ?? "unknown"})`,
      updatedAt: new Date().toISOString(),
      cells: [
        {
          id: "telemetry-heartbeat",
          label: "Telemetry heartbeat",
          intensity: Math.max(20, Math.min(100, Number(metrics?.opportunitiesDetected ?? 0) + 20)),
          pool: `pairs watched: ${status.pairsWatched ?? 0}`,
        },
      ],
    };
  }

  const guardAddress = asAddress(policy?.guardAddress ?? policy?.swapGuardAddress ?? PUBLIC_GUARD_ADDRESS);
  const safeAddress = asAddress(policy?.safeAddress ?? PUBLIC_SAFE_ADDRESS);
  const moduleAddress = asAddress(policy?.moduleAddress ?? PUBLIC_MODULE_ADDRESS);

  dashboard.safetyVault = {
    ...(dashboard.safetyVault ?? EMPTY_DASHBOARD.safetyVault),
    permissions: [
      ...(dashboard.safetyVault?.permissions ?? []),
      { label: "Guard configured", enabled: Boolean(guardAddress), detail: guardAddress ?? "Missing NEXT_PUBLIC_GUARD_ADDRESS" },
      { label: "Safe configured", enabled: Boolean(safeAddress), detail: safeAddress ?? "Missing NEXT_PUBLIC_SAFE_ADDRESS" },
      { label: "Module configured", enabled: Boolean(moduleAddress), detail: moduleAddress ?? "Missing NEXT_PUBLIC_MODULE_ADDRESS" },
    ],
  };

  if (!dashboard.safetyVault?.guardrails?.length) {
    dashboard.safetyVault = {
      ...(dashboard.safetyVault ?? EMPTY_DASHBOARD.safetyVault),
      guardrails: [
        {
          label: "Policy cache",
          value: policy ? "Connected" : "Pending /api/policy",
        },
        {
          label: "Telemetry status",
          value: status ? "Connected" : "Unavailable",
        },
      ],
    };
  }

  if (publicClient && guardAddress) {
    try {
      const [owner, paused, defaultMaxDailyVolume, cooldownSeconds, maxDeadlineDelay, maxOracleStaleness, maxOracleDeviationBps, maxSlippageBps, maxExactOutputInputBufferBps, requireExplicitTokenLimits, oracle] = await Promise.all([
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "owner" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "paused" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "defaultMaxDailyVolume" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "cooldownSeconds" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "maxDeadlineDelay" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "maxOracleStaleness" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "maxOracleDeviationBps" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "maxSlippageBps" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "maxExactOutputInputBufferBps" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "requireExplicitTokenLimits" }),
        publicClient.readContract({ address: guardAddress, abi: SWAP_GUARD_ABI, functionName: "oracle" }),
      ]);

      dashboard.safetyVault = {
        ...(dashboard.safetyVault ?? EMPTY_DASHBOARD.safetyVault),
        killSwitch: paused ? "paused" : "disarmed",
        permissions: [
          { label: "Guard owner", enabled: Boolean(owner), detail: owner as string },
          { label: "Guard active", enabled: true, detail: guardAddress },
          { label: "Safe active", enabled: Boolean(safeAddress), detail: safeAddress },
        ],
        guardrails: [
          { label: "Default max daily volume", value: String(defaultMaxDailyVolume) },
          { label: "Cooldown", value: `${String(cooldownSeconds)} s` },
          { label: "Deadline delay", value: `${String(maxDeadlineDelay)} s` },
          { label: "Oracle staleness", value: `${String(maxOracleStaleness)} s` },
          { label: "Oracle deviation", value: `${String(maxOracleDeviationBps)} bps` },
          { label: "Max slippage", value: `${String(maxSlippageBps)} bps` },
          { label: "Exact-output buffer", value: `${String(maxExactOutputInputBufferBps)} bps` },
          { label: "Explicit token limits", value: String(requireExplicitTokenLimits) },
          { label: "Oracle", value: oracle as string },
        ],
      };

      dashboard.strategyStudio = {
        ...(dashboard.strategyStudio ?? EMPTY_DASHBOARD.strategyStudio),
        controls: [
          { id: "slippage", label: "Max slippage", value: Number(maxSlippageBps), min: 0, max: 1000, step: 1, suffix: "bps", note: "Read from SwapGuard on-chain" },
          { id: "deadline", label: "Deadline delay", value: Number(maxDeadlineDelay), min: 0, max: 3600, step: 30, suffix: "s", note: "Read from SwapGuard on-chain" },
          { id: "cooldown", label: "Cooldown", value: Number(cooldownSeconds), min: 0, max: 86400, step: 60, suffix: "s", note: "Read from SwapGuard on-chain" },
        ],
      };

      dashboard.nexus = {
        ...(dashboard.nexus ?? EMPTY_DASHBOARD.nexus),
        graphLabel: `Guard ${guardAddress.slice(0, 6)}…${guardAddress.slice(-4)}`,
      };

      dashboard.agentIdentity = {
        ...(dashboard.agentIdentity ?? EMPTY_DASHBOARD.agentIdentity),
        passportId: `BAP-578 · ${guardAddress.slice(0, 10)}`,
      };
    } catch {
      // Keep the telemetry snapshot even if one live chain read fails.
    }
  }

  if (publicClient && safeAddress && moduleAddress) {
    try {
      const enabled = await publicClient.readContract({
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "isModuleEnabled",
        args: [moduleAddress],
      });

      dashboard.safetyVault = {
        ...(dashboard.safetyVault ?? EMPTY_DASHBOARD.safetyVault),
        permissions: [
          ...(dashboard.safetyVault?.permissions ?? []),
          { label: "Module enabled in Safe", enabled: Boolean(enabled), detail: moduleAddress },
        ],
      };
    } catch {
      // Ignore Safe read failures and keep the rest of the telemetry surface.
    }
  }

  if (!isAddressLike(guardAddress) && !isAddressLike(safeAddress)) {
    dashboard.strategyStudio = dashboard.strategyStudio ?? buildStrategyStudio(policy);
  }

  return dashboard;
}

const DashboardDataContext = createContext<DashboardData>(EMPTY_DASHBOARD);

export function DashboardDataProvider({
  children,
  refreshIntervalMs = 5000,
}: Readonly<{
  children: React.ReactNode;
  refreshIntervalMs?: number;
}>) {
  const publicClient = usePublicClient();
  const account = useAccount();
  const [value, setValue] = useState<DashboardData>(EMPTY_DASHBOARD);

  useEffect(() => {
    let active = true;

    async function refresh(): Promise<void> {
      const snapshot = await fetchLiveSnapshot(publicClient ?? null);
      if (!active) {
        return;
      }

      snapshot.agentIdentity = {
        ...(snapshot.agentIdentity ?? EMPTY_DASHBOARD.agentIdentity),
        attestations: [
          ...(snapshot.agentIdentity?.attestations ?? []),
          account.address ? `Wallet: ${account.address}` : "Wallet disconnected",
        ],
      };

      setValue(snapshot);
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, refreshIntervalMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [account.address, publicClient, refreshIntervalMs]);

  const contextValue = useMemo(() => value, [value]);

  return <DashboardDataContext.Provider value={contextValue}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData<T extends keyof DashboardData>(key: T): DashboardData[T] {
  return useContext(DashboardDataContext)[key];
}
