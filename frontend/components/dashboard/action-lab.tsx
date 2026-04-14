"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { Activity, Bot, Cpu, Shield } from "lucide-react";
import { GlassPanel } from "./ui-components";

type TaskDefinition = {
  id: string;
  title: string;
  detail: string;
  etaSeconds: number;
  risk: "low" | "medium" | "high";
  stages: string[];
};

const TASKS: TaskDefinition[] = [
  {
    id: "delta-neutral-rebalance",
    title: "Delta-Neutral Rebalancer",
    detail: "Trigger: native token strength >10% or stable reserve under threshold. Action: lock profit into FDUSD/USDC.",
    etaSeconds: 18,
    risk: "medium",
    stages: ["Observe reserve drift", "Calculate rebalance size", "Verify slippage + limits", "Execute Safe module swap"],
  },
  {
    id: "convex-lp-migration",
    title: "Convex Liquidity Migration",
    detail: "Trigger: alternative DEX pool has >2% higher volume-adjusted fee yield. Action: withdraw, rebalance, redeploy in one batch.",
    etaSeconds: 22,
    risk: "medium",
    stages: ["Observe pool fee delta", "Calculate migration path", "Verify atomic batch safety", "Execute withdraw+swap+deposit"],
  },
  {
    id: "protocol-buyback-burn",
    title: "Automated Buy-Back & Burn / LP Support",
    detail: "Trigger: token reaches support level. Action: convert stable fees into native token for burn or LP floor support.",
    etaSeconds: 26,
    risk: "high",
    stages: ["Observe support breach", "Calculate buyback amount", "Verify floor-defense guardrails", "Execute support transaction"],
  },
  {
    id: "yield-harvest-reinvest",
    title: "Yield-Hustle Reward Harvesting",
    detail: "Trigger: rewards exceed gas cost by 10x. Action: harvest, convert, and restake into highest-yield venue.",
    etaSeconds: 16,
    risk: "low",
    stages: ["Observe reward buffer", "Calculate harvest ROI", "Verify gas ratio + slippage", "Execute claim+swap+restake"],
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SafeSignerStatus = {
  isSigner: boolean;
  safeAddress?: string;
  unavailable?: boolean;
  reason?: string;
};

type EndpointState = "online" | "degraded" | "offline";

type EndpointReadiness = {
  label: string;
  path: string;
  state: EndpointState;
  detail: string;
};

type AgentHealthSummary = {
  telemetryBaseUrl: string;
  health?: {
    ok: boolean;
    status: number;
    body?: unknown;
  };
  status?: {
    ok: boolean;
    status: number;
    body?: unknown;
  };
  circuitBreaker?: {
    tripped?: boolean;
    consecutiveFailures?: number;
    tripReason?: string | null;
    trippedAt?: string | null;
  } | null;
  summary?: {
    online: number;
    total: number;
  };
};

type TaskRunResponse = {
  taskId?: string;
  state?: string;
  status?: string;
  message?: string;
  proof?: {
    txHash?: string | null;
    details?: Record<string, unknown>;
  };
};

type TaskStatusRecord = {
  taskId: string;
  state: string;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastMessage: string | null;
  txHash: string | null;
};

type TaskStatusResponse = {
  enabled: boolean;
  tasks: TaskStatusRecord[];
};

async function postAgent<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Some agent servers expose these endpoints as GET-only.
  if (response.status === 405) {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });

    const fallback = await fetch(`${path}?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!fallback.ok) {
      const fallbackText = await fallback.text();
      throw new Error(fallbackText || `GET fallback failed with ${fallback.status}`);
    }

    return (await fallback.json()) as T;
  }

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText) as { error?: string; message?: string };
      throw new Error(parsed.message ?? parsed.error ?? `Request failed with ${response.status}`);
    } catch {
      throw new Error(errorText || `Request failed with ${response.status}`);
    }
  }

  return (await response.json()) as T;
}

async function fetchSafeSignerStatus(walletAddress: string): Promise<SafeSignerStatus> {
  const response = await fetch(`/api/agent/safe/signer-status?address=${encodeURIComponent(walletAddress)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (response.status === 404 || response.status === 405) {
    return {
      isSigner: false,
      unavailable: true,
      reason: `Signer verification endpoint unavailable (${response.status}).`,
    };
  }

  if (!response.ok) {
    throw new Error(`Unable to verify signer status (${response.status})`);
  }

  return (await response.json()) as SafeSignerStatus;
}

async function probeEndpoint(label: string, path: string): Promise<EndpointReadiness> {
  try {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      return { label, path, state: "online", detail: `Online (${response.status})` };
    }

    if (response.status === 400 || response.status === 404 || response.status === 405) {
      return {
        label,
        path,
        state: "degraded",
        detail: `Reachable but contract mismatch (${response.status})`,
      };
    }

    return { label, path, state: "offline", detail: `Unavailable (${response.status})` };
  } catch {
    return { label, path, state: "offline", detail: "Network unreachable" };
  }
}

async function fetchAgentHealthSummary(): Promise<AgentHealthSummary> {
  const response = await fetch("/api/agent/health", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Health endpoint failed with ${response.status}`);
  }

  return (await response.json()) as AgentHealthSummary;
}

function readinessDotClass(state: EndpointState): string {
  if (state === "online") {
    return "bg-emerald-400";
  }
  if (state === "degraded") {
    return "bg-amber-400";
  }
  return "bg-red-400";
}

function riskClass(risk: TaskDefinition["risk"]): string {
  if (risk === "high") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }
  if (risk === "medium") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
}

export function AutonomousTaskRunner() {
  const { address, isConnected } = useAccount();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [recentTasks, setRecentTasks] = useState<string[]>([]);
  const [safeSignerStatus, setSafeSignerStatus] = useState<SafeSignerStatus | null>(null);
  const [safeSignerError, setSafeSignerError] = useState<string | null>(null);
  const [checkingSigner, setCheckingSigner] = useState(false);
  const [endpointReadiness, setEndpointReadiness] = useState<EndpointReadiness[]>([]);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [healthSummary, setHealthSummary] = useState<AgentHealthSummary | null>(null);
  const [liveTaskStatus, setLiveTaskStatus] = useState<TaskStatusRecord[]>([]);

  const activeTask = useMemo(() => TASKS.find((task) => task.id === activeTaskId) ?? null, [activeTaskId]);
  const running = Boolean(activeTaskId);

  useEffect(() => {
    if (!address || !isConnected) {
      setSafeSignerStatus(null);
      setSafeSignerError(null);
      return;
    }

    let mounted = true;
    setCheckingSigner(true);
    fetchSafeSignerStatus(address)
      .then((status) => {
        if (mounted) {
          setSafeSignerStatus(status);
          setSafeSignerError(null);
        }
      })
      .catch((error) => {
        if (mounted) {
          setSafeSignerStatus(null);
          setSafeSignerError(error instanceof Error ? error.message : "Signer check failed");
        }
      })
      .finally(() => {
        if (mounted) {
          setCheckingSigner(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [address, isConnected]);

  useEffect(() => {
    let mounted = true;
    setCheckingReadiness(true);

    fetchAgentHealthSummary()
      .then((summary) => {
        if (!mounted) {
          return;
        }

        setHealthSummary(summary);

        const healthOk = Boolean(summary.health?.ok);
        const statusOk = Boolean(summary.status?.ok);
        const breakerTripped = Boolean(summary.circuitBreaker?.tripped);

        setEndpointReadiness([
          {
            label: "Telemetry liveness",
            path: "/api/agent/health",
            state: healthOk ? "online" : "offline",
            detail: summary.health ? `HTTP ${summary.health.status}` : "No liveness data",
          },
          {
            label: "Agent status",
            path: "/api/agent/health",
            state: statusOk ? "online" : "offline",
            detail: summary.status ? `HTTP ${summary.status.status}` : "No status data",
          },
          {
            label: "Circuit breaker",
            path: "/api/agent/health",
            state: breakerTripped ? "degraded" : "online",
            detail: breakerTripped ? summary.circuitBreaker?.tripReason ?? "Tripped" : "Closed",
          },
        ]);
      })
      .catch((error) => {
        if (mounted) {
          setEndpointReadiness([
            { label: "Telemetry liveness", path: "/api/agent/health", state: "offline", detail: "Unavailable" },
            { label: "Agent status", path: "/api/agent/health", state: "offline", detail: "Unavailable" },
            { label: "Circuit breaker", path: "/api/agent/health", state: "offline", detail: "Unavailable" },
          ]);
          setResultSummary(error instanceof Error ? error.message : "Unable to load health summary.");
        }
      })
      .finally(() => {
        if (mounted) {
          setCheckingReadiness(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchTaskStatus = async () => {
      try {
        const response = await fetch("/api/agent/tasks/status", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as TaskStatusResponse;
        if (mounted && body.enabled) {
          setLiveTaskStatus(body.tasks);
        }
      } catch {
        // Keep current status when polling fails.
      }
    };

    void fetchTaskStatus();
    const id = setInterval(() => {
      void fetchTaskStatus();
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const refreshHealthSummary = async () => {
    setCheckingReadiness(true);
    try {
      const summary = await fetchAgentHealthSummary();
      setHealthSummary(summary);

      const breakerTripped = Boolean(summary.circuitBreaker?.tripped);
      setEndpointReadiness([
        {
          label: "Telemetry liveness",
          path: "/api/agent/health",
          state: Boolean(summary.health?.ok) ? "online" : "offline",
          detail: summary.health ? `HTTP ${summary.health.status}` : "No liveness data",
        },
        {
          label: "Agent status",
          path: "/api/agent/health",
          state: Boolean(summary.status?.ok) ? "online" : "offline",
          detail: summary.status ? `HTTP ${summary.status.status}` : "No status data",
        },
        {
          label: "Circuit breaker",
          path: "/api/agent/health",
          state: breakerTripped ? "degraded" : "online",
          detail: breakerTripped ? summary.circuitBreaker?.tripReason ?? "Tripped" : "Closed",
        },
      ]);
    } finally {
      setCheckingReadiness(false);
    }
  };

  const copyHealthSummary = async () => {
    if (!healthSummary) {
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify(healthSummary, null, 2));
    setResultSummary("Health summary copied to clipboard.");
  };

  const runTask = async (task: TaskDefinition) => {
    if (running) {
      return;
    }

    if (task.risk === "high") {
      if (!isConnected || !address) {
        setResultSummary("Blocked high-risk task: connect wallet first.");
        return;
      }
      if (!safeSignerStatus?.isSigner) {
        setResultSummary(safeSignerStatus?.unavailable ? safeSignerStatus.reason ?? "Blocked high-risk task: signer verification service unavailable." : "Blocked high-risk task: connected wallet is not an authorized Safe signer.");
        return;
      }
    }

    setResultSummary(null);
    setActiveTaskId(task.id);
    setStageIndex(0);
    setProgress(0);

    try {
      const runResponse = await postAgent<TaskRunResponse>("/api/agent/tasks/run", {
        taskId: task.id,
        risk: task.risk,
        walletAddress: address ?? null,
      });

      for (let i = 0; i < task.stages.length; i += 1) {
        setStageIndex(i);
        setProgress(Math.round(((i + 1) / task.stages.length) * 100));
        await delay(700);
      }

      const completedAt = new Date().toLocaleTimeString();
      setResultSummary(
        `Task ${task.title.toLowerCase()} ${runResponse.state?.toLowerCase() ?? "submitted"} at ${completedAt}. ${runResponse.message ?? "Agent accepted the request."}`,
      );
      setRecentTasks((prev) => [task.title, ...prev].slice(0, 4));

      if (runResponse.proof?.txHash) {
        setResultSummary((prev) => `${prev ?? ""} Tx: ${runResponse.proof?.txHash}`.trim());
      }
    } catch (error) {
      setResultSummary(error instanceof Error ? error.message : "Failed to run task via /api/agent/tasks/run.");
    } finally {
      setActiveTaskId(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <GlassPanel title="Autonomous Task Runner" subtitle="Launch aggressive treasury operations with staged execution feedback.">
        <div className="grid gap-3 md:grid-cols-2">
          {TASKS.map((task) => (
            <div key={task.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-50">{task.title}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{task.detail}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${riskClass(task.risk)}`}>
                  {task.risk}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>ETA {task.etaSeconds}s</span>
                <span>{task.stages.length} phases</span>
              </div>
              <button
                onClick={() => {
                  void runTask(task);
                }}
                disabled={running}
                className="mt-3 w-full rounded-xl bg-amber-400 px-3 py-2 text-sm font-medium text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-600"
              >
                {activeTaskId === task.id ? "Running..." : "Launch Task"}
              </button>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel title="Mission Telemetry" subtitle="Live execution state, phase progression, and generated artifacts.">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Startup readiness</p>
                <p className="mt-1 text-sm text-stone-50">{checkingReadiness ? "Pinging live endpoints..." : "Endpoint health snapshot"}</p>
              </div>
              <span className="text-xs text-zinc-500">{endpointReadiness.length}/3 checked</span>
            </div>
            <div className="mt-4 grid gap-2">
              {endpointReadiness.length ? (
                endpointReadiness.map((endpoint) => (
                  <div key={endpoint.path} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${readinessDotClass(endpoint.state)}`} />
                      <span className="text-zinc-200">{endpoint.label}</span>
                    </div>
                    <span className="text-zinc-500">{endpoint.detail}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">Waiting for startup probe results.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniBadge icon={Bot} label="Agent" value={running ? "Active" : "Idle"} />
            <MiniBadge icon={Cpu} label="Pipeline" value={running ? "Executing" : "Standby"} />
            <MiniBadge icon={Shield} label="Guardrails" value={safeSignerStatus?.isSigner ? "Signer Verified" : safeSignerStatus?.unavailable ? "Signer API Missing" : "Enforced"} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-300">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">High-risk gate</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void refreshHealthSummary();
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/10"
                >
                  Refresh health
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void copyHealthSummary();
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/10"
                >
                  Copy report
                </button>
              </div>
            </div>
            <p className="mt-2">
              {checkingSigner
                ? "Checking Safe signer status..."
                : !isConnected
                  ? "Connect wallet to unlock high-risk actions."
                  : safeSignerStatus?.unavailable
                    ? (safeSignerStatus.reason ?? "Signer verification API unavailable. High-risk actions are locked.")
                    : safeSignerStatus?.isSigner
                    ? `Authorized Safe signer${safeSignerStatus.safeAddress ? ` for ${safeSignerStatus.safeAddress}` : ""}.`
                    : "Connected wallet is not an authorized Safe signer."}
            </p>
            {safeSignerError ? <p className="mt-2 text-amber-200">{safeSignerError}</p> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Current phase</p>
            <p className="mt-2 text-sm text-stone-50">
              {activeTask ? activeTask.stages[stageIndex] : "No active task"}
            </p>
            <div className="mt-4 h-2 rounded-full bg-zinc-800">
              <motion.div
                animate={{ width: `${progress}%` }}
                className="h-2 rounded-full bg-linear-to-r from-amber-400 to-orange-300"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{progress}% complete</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Output summary</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{resultSummary ?? "Launch a task to generate execution output and operator-ready artifacts."}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Execution mode</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                <span className="block text-zinc-500">Telemetry status</span>
                <span className="mt-1 block text-stone-50">{healthSummary?.status?.body && typeof healthSummary.status.body === "object" && "executionMode" in healthSummary.status.body ? String((healthSummary.status.body as { executionMode?: string }).executionMode) : "Unknown"}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                <span className="block text-zinc-500">Pairs watched</span>
                <span className="mt-1 block text-stone-50">{healthSummary?.status?.body && typeof healthSummary.status.body === "object" && "pairsWatched" in healthSummary.status.body ? String((healthSummary.status.body as { pairsWatched?: number }).pairsWatched) : "Unknown"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Recent completions</p>
            <div className="mt-3 space-y-2">
              {recentTasks.length ? (
                recentTasks.map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                    <span>{item}</span>
                    <Activity className="h-3.5 w-3.5 text-emerald-300" />
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No completed tasks yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Live task state</p>
            <div className="mt-3 space-y-2">
              {liveTaskStatus.length ? (
                liveTaskStatus.map((task) => (
                  <div key={task.taskId} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-50">{task.taskId}</span>
                      <span className="uppercase tracking-[0.12em] text-zinc-500">{task.state}</span>
                    </div>
                    {task.lastMessage ? <p className="mt-1 text-zinc-400">{task.lastMessage}</p> : null}
                    <p className="mt-1 text-zinc-500">
                      Next run: {task.nextRunAt ? new Date(task.nextRunAt).toLocaleTimeString() : "n/a"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No live task status available yet.</p>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function MiniBadge({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] uppercase tracking-[0.24em]">{label}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-stone-50">{value}</p>
    </div>
  );
}
