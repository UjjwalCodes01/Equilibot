"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scaleLinear, scaleSequential } from "d3";
import {
  ArrowRight,
  BarChart3,
  Binary,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  LineChart as LineChartIcon,
  LockKeyhole,
  Network,
  Shield,
  Sparkles,
  SquareTerminal,
  Waves,
} from "lucide-react";

import {
  AgentIdentityData,
  ArbitrageHeatCell,
  AuditEntry,
  GovernanceAuditData,
  IncentiveArbitrageData,
  LiquidityLink,
  LiquidityNode,
  LiquidityTopologyData,
  NexusData,
  SafetyVaultData,
  SimulationSandboxData,
  StrategyStudioData,
  TerminalData,
  TreasuryHealthData,
  useDashboardData,
} from "@/lib/dashboard-data";

type FrameProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}>;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function PageFrame({ eyebrow, title, description, actions, children }: FrameProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">{eyebrow}</p>
          <h3 className="font-serif text-3xl text-stone-50 md:text-5xl">{title}</h3>
          <p className="max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function GlassPanel({
  title,
  subtitle,
  children,
  className,
}: Readonly<{
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className={cx("rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl", className)}>
      {title || subtitle ? (
        <div className="mb-5 flex flex-col gap-1 border-b border-white/8 pb-4">
          {title ? <h4 className="font-serif text-2xl text-stone-50">{title}</h4> : null}
          {subtitle ? <p className="text-sm leading-6 text-zinc-400">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function EmptyState({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 px-5 py-8 text-center">
      <p className="text-sm font-medium text-stone-50">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400">{detail}</p>
    </div>
  );
}

function StatCard({ label, value, suffix }: Readonly<{ label: string; value: string | number; suffix?: string }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">{label}</p>
      <p className="mt-2 font-serif text-2xl text-stone-50">
        {value}
        {suffix ? <span className="ml-1 text-sm text-amber-200/80">{suffix}</span> : null}
      </p>
    </div>
  );
}

function SectionLabel({ icon: Icon, title, description }: Readonly<{ icon: React.ComponentType<{ className?: string }>; title: string; description: string }>) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h5 className="font-medium text-stone-50">{title}</h5>
        <p className="text-sm leading-6 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function LivePill({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      {children}
    </span>
  );
}

function TransparentButton({ children, href }: Readonly<{ children: React.ReactNode; href?: string }>) {
  const base = "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-100";
  if (href) {
    return (
      <Link className={base} href={href}>
        {children}
      </Link>
    );
  }

  return <button className={base}>{children}</button>;
}

function chartTooltipLabel(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : String(value ?? "")
}

function renderMetricValue(value: number | string): string {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function NexusLogs({ data }: Readonly<{ data?: NexusData }>) {
  const logs = data?.logs ?? [];
  const steps = data?.thoughtSteps ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <GlassPanel title="ElizaOS live stream" subtitle="Rendered only from connected telemetry. No synthetic logs are emitted here.">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <LivePill>{data?.status ?? "Awaiting live connection"}</LivePill>
            <span className="text-sm text-zinc-400">{data?.heartbeat ?? "Heartbeat pending"}</span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
            {logs.length === 0 ? (
              <EmptyState
                title="No live logs connected"
                detail="Connect the Nexus page to the ElizaOS log stream or SSE bridge to surface real agent output here."
              />
            ) : (
              <div className="scrollbar-hidden max-h-112 space-y-3 overflow-y-auto pr-1 font-mono text-[13px] leading-6 text-zinc-300">
                {logs.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.message}`} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      <span>{entry.timestamp}</span>
                      <span>{entry.level}</span>
                      {entry.component ? <span>{entry.component}</span> : null}
                    </div>
                    <p className="mt-2 text-zinc-100">{entry.message}</p>
                    {entry.details ? <p className="mt-1 text-zinc-400">{entry.details}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel title="Observe → Calculate → Verify → Execute" subtitle="The agent’s reasoning graph is live, but it only renders steps that arrive from connected telemetry.">
        {steps.length === 0 ? (
          <EmptyState
            title="No reasoning steps available yet"
            detail="Connect structured agent traces to visualize the current decision cycle on this command surface."
          />
        ) : (
          <div className="scrollbar-hidden max-h-112 space-y-3 overflow-y-auto pr-1">
            {steps.map((step, index) => (
              <motion.div
                key={`${step.label}-${index}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/60">{step.state}</p>
                    <h5 className="mt-1 font-medium text-stone-50">{step.label}</h5>
                  </div>
                  {step.timestamp ? <span className="text-xs text-zinc-500">{step.timestamp}</span> : null}
                </div>
                {step.detail ? <p className="mt-2 text-sm leading-6 text-zinc-400">{step.detail}</p> : null}
              </motion.div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function LiquidityTopologyCanvas({ nodes, links }: Readonly<{ nodes?: LiquidityNode[]; links?: LiquidityLink[] }>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const xScale = scaleLinear().domain([0, 100]).range([60, Math.max(120, width - 60)]);
      const yScale = scaleLinear().domain([0, 100]).range([60, Math.max(120, height - 60)]);
      const depthScale = scaleLinear().domain([0, 100]).range([0.65, 1.35]);
      const linkScale = scaleLinear().domain([0, 1]).range([0.5, 2.8]);

      const nodeMap = new Map(nodes.map((node) => [node.id, node]));

      ctx.strokeStyle = "rgba(251, 191, 36, 0.22)";
      ctx.fillStyle = "rgba(251, 191, 36, 0.14)";

      for (const link of links ?? []) {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) {
          continue;
        }

        ctx.beginPath();
        ctx.lineWidth = linkScale(link.intensity ?? 0.5);
        ctx.moveTo(xScale(source.x), yScale(source.y));
        ctx.lineTo(xScale(target.x), yScale(target.y));
        ctx.stroke();
      }

      for (const node of nodes) {
        const radius = 8 * depthScale(node.z ?? 50);
        const cx = xScale(node.x);
        const cy = yScale(node.y);

        ctx.beginPath();
        ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(251, 191, 36, 0.08)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
        ctx.fill();

        ctx.font = "600 12px var(--font-geist-sans, Inter, sans-serif)";
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(node.label, cx + radius + 10, cy + 4);
      }
    };

    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [links, nodes]);

  return <canvas ref={canvasRef} className="h-105 w-full rounded-[26px] border border-white/10 bg-black/35" />;
}

function TreasuryCharts({ data }: Readonly<{ data?: TreasuryHealthData }>) {
  const metricCount = data?.metrics?.length ?? 0;

  if (metricCount === 0 && !data?.slippageSeries?.length && !data?.efficiencySeries?.length && !data?.ilMitigationSeries?.length) {
    return <EmptyState title="No treasury telemetry connected" detail="Hook in live Viem/Wagmi data to populate slippage savings, IL mitigation, and rebalancing efficiency." />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <GlassPanel title="Treasury health telemetry" subtitle="Every chart consumes live data only. Nothing is prefilled here.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(data?.metrics ?? []).map((metric) => (
            <StatCard key={metric.label} label={metric.label} value={renderMetricValue(metric.value)} suffix={metric.unit} />
          ))}
        </div>
      </GlassPanel>

      <GlassPanel title="Slippage saved" subtitle="Trend view for realized slippage reduction once the telemetry feed is attached.">
        {data?.slippageSeries?.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.slippageSeries}>
              <defs>
                <linearGradient id="slippageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="timestamp" stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 }} labelFormatter={(value) => String(value)} formatter={(value) => chartTooltipLabel(value)} />
              <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="url(#slippageGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No slippage telemetry yet" detail="Connect your treasury telemetry feed to render the savings curve." />
        )}
      </GlassPanel>

      <GlassPanel title="Rebalancing efficiency" subtitle="Compare rebalance quality over time with live series data.">
        {data?.efficiencySeries?.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.efficiencySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="timestamp" stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 }} formatter={(value) => chartTooltipLabel(value)} />
              <Line type="monotone" dataKey="value" stroke="#eab308" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No efficiency series connected" detail="Feed live rebalancing performance here to quantify how much treasury work the agent saves." />
        )}
      </GlassPanel>

      <GlassPanel title="Impermanent loss mitigation" subtitle="The IL mitigation signal comes from the same live telemetry layer.">
        {data?.ilMitigationSeries?.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.ilMitigationSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="timestamp" stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 }} formatter={(value) => chartTooltipLabel(value)} />
              <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                {(data.ilMitigationSeries ?? []).map((entry, index) => (
                  <Cell key={entry.timestamp} fill={index % 2 === 0 ? "#f59e0b" : "#d97706"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No IL mitigation series connected" detail="Connect live metrics to expose the agent’s mitigation impact over time." />
        )}
      </GlassPanel>
    </div>
  );
}

function StrategyControls({ data }: Readonly<{ data?: StrategyStudioData }>) {
  const controls = data?.controls ?? [];

  if (controls.length === 0) {
    return <EmptyState title="No strategy draft connected" detail="Wire the strategy engine outputs into this studio to make sliders and route cards interactive." />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {controls.map((control) => (
        <motion.div key={control.id} drag className="rounded-3xl border border-white/10 bg-black/25 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{control.label}</p>
              {control.note ? <p className="mt-2 text-sm leading-6 text-zinc-400">{control.note}</p> : null}
            </div>
            <p className="font-serif text-2xl text-stone-50">
              {control.value}
              {control.suffix ?? ""}
            </p>
          </div>
          <input
            aria-label={control.label}
            type="range"
            className="mt-5 w-full accent-amber-400"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={control.value}
            readOnly
          />
        </motion.div>
      ))}
    </div>
  );
}

function SimulationRuns({ data }: Readonly<{ data?: SimulationSandboxData }>) {
  const runs = data?.runs ?? [];

  if (runs.length === 0) {
    return <EmptyState title="No simulation runs connected" detail="Plug in the Anvil-backed simulation feed to replay the last 24 hours of trading behavior." />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <GlassPanel title="Replay queue" subtitle={data?.forkLabel ?? "Mainnet fork status will appear once the simulation bridge is connected."}>
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-50">{run.id}</p>
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{run.status}</p>
                </div>
                {run.executedAt ? <span className="text-xs text-zinc-500">{run.executedAt}</span> : null}
              </div>
              {run.reason ? <p className="mt-2 text-sm leading-6 text-zinc-400">{run.reason}</p> : null}
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel title="Balance diff" subtitle="Before/after state reflects actual simulation output, not fixtures.">
        {runs[0]?.before?.length && runs[0]?.after?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Before</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                {runs[0].before!.map((item) => (
                  <div key={`${item.label}-${item.symbol}`} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-mono text-zinc-100">{item.amount} {item.symbol}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">After</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-100">
                {runs[0].after!.map((item) => (
                  <div key={`${item.label}-${item.symbol}`} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <span className="font-mono">{item.amount} {item.symbol}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="No before/after simulation diff available" detail="Provide a simulation snapshot to render the trade replay comparison." />
        )}
      </GlassPanel>
    </div>
  );
}

function AuditList({ data }: Readonly<{ data?: GovernanceAuditData }>) {
  const entries = data?.entries ?? [];
  const selected = entries.find((entry) => entry.id === data?.selectedEntryId) ?? entries[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <GlassPanel title="Greenfield explorer" subtitle="Click a record to inspect the attached proof of intent once the live audit feed is wired.">
        {entries.length === 0 ? (
          <EmptyState title="No audit stream connected" detail="Attach the BNB Greenfield-backed audit source to browse transaction history and proof bundles." />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className={cx("rounded-2xl border p-4 transition", selected?.id === entry.id ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-white/5")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-stone-50">{entry.summary}</p>
                    <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{entry.status}</p>
                  </div>
                  <span className="text-xs text-zinc-500">{entry.timestamp}</span>
                </div>
                {entry.txHash ? <p className="mt-2 font-mono text-xs text-zinc-400">{entry.txHash}</p> : null}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      <GlassPanel title="Proof of intent" subtitle="This panel is designed for real reasoning artifacts, not generated placeholder narratives.">
        {selected ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Status" value={selected.status} />
              <StatCard label="Timestamp" value={selected.timestamp} />
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4 font-mono text-sm leading-7 text-zinc-300">
              {selected.proofOfIntent ?? "Connect the Greenfield proof artifact to surface the agent’s actual intent reasoning here."}
            </div>
          </div>
        ) : (
          <EmptyState title="No selected audit entry" detail="Choose a transaction from the left panel to inspect proof-of-intent metadata." />
        )}
      </GlassPanel>
    </div>
  );
}

function SafetyVaultView({ data }: Readonly<{ data?: SafetyVaultData }>) {
  const permissions = data?.permissions ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <GlassPanel title="Gnosis Safe control surface" subtitle="Module permissions and guardrails appear here from live reads.">
        <div className="space-y-4">
          <div className="rounded-3xl border border-amber-400/25 bg-amber-400/10 p-5 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Kill switch</p>
            <p className="mt-2 font-serif text-3xl text-amber-50">{data?.killSwitch ?? "Unknown"}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {permissions.map((permission) => (
              <div key={permission.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-50">{permission.label}</p>
                  <span className={permission.enabled ? "text-emerald-300" : "text-zinc-500"}>{permission.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                {permission.detail ? <p className="mt-2 text-sm leading-6 text-zinc-400">{permission.detail}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel title="Active guardrails" subtitle="Policy values are rendered as live state, not copy-pasted into the UI.">
        {data?.guardrails?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.guardrails.map((guardrail) => (
              <div key={guardrail.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{guardrail.label}</p>
                <p className="mt-2 text-lg text-stone-50">{guardrail.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No guardrail feed connected" detail="Connect on-chain reads from the Safe module and SwapGuard to expose current limits and permissions." />
        )}
      </GlassPanel>
    </div>
  );
}

function HeatmapGrid({ data }: Readonly<{ data?: IncentiveArbitrageData }>) {
  const cells = data?.cells ?? [];
  const intensityScale = useMemo(() => scaleSequential((t) => `rgba(245, 158, 11, ${0.18 + t * 0.72})`), []);

  if (cells.length === 0) {
    return <EmptyState title="No incentive map connected" detail="Provide live farming-reward observations to illuminate the treasury’s yield hunt." />;
  }

  const max = Math.max(...cells.map((cell) => cell.intensity), 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.id} className="rounded-3xl border border-white/10 p-4" style={{ background: intensityScale(cell.intensity / max) }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-stone-50">{cell.label}</p>
              {cell.pool ? <p className="mt-1 text-xs uppercase tracking-[0.28em] text-zinc-500">{cell.pool}</p> : null}
            </div>
            <p className="font-serif text-2xl text-amber-50">{cell.intensity}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function IdentityPassport({ data }: Readonly<{ data?: AgentIdentityData }>) {
  const score = Math.max(0, Math.min(100, data?.reputationScore ?? 0));

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <GlassPanel title="BAP-578 passport" subtitle="A verifiable identity surface for this EquiliBot instance.">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" data={[{ name: "score", value: score, fill: "#f59e0b" }]} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={999} fill="#f59e0b" />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-500">Reputation</p>
              <p className="font-serif text-5xl text-stone-50">{score}</p>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Passport ID</p>
            <p className="mt-2 font-mono text-sm text-zinc-200">{data?.passportId ?? "Connect on-chain identity source"}</p>
          </div>
          <p className="text-sm leading-6 text-zinc-400">{data?.uptime ?? "Uptime feed not yet connected."}</p>
        </div>
      </GlassPanel>

      <GlassPanel title="Performance history" subtitle="Metrics and attestations should arrive from the same verifiable identity source.">
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.metrics ?? []).map((metric) => (
            <StatCard key={metric.label} label={metric.label} value={metric.value} />
          ))}
          <div className="md:col-span-2 rounded-3xl border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Attestations</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(data?.attestations ?? []).length ? (
                data!.attestations!.map((item) => (
                  <span key={item} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-100">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-zinc-400">No attestations connected.</span>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function TerminalView({ data }: Readonly<{ data?: TerminalData }>) {
  const entries = data?.entries ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <GlassPanel title="System health" subtitle="Keyboard-driven operators can inspect the raw health feed here.">
        <div className="scrollbar-hidden max-h-112 space-y-3 overflow-y-auto pr-1">
          <div className="space-y-3">
            {(data?.health ?? []).map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <span className="text-zinc-400">{item.label}</span>
                <span className="font-mono text-stone-50">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-6 text-zinc-400">
            <p>Shortcuts</p>
            <p className="mt-2">J/K navigate logs • / focus command filter • E export raw trace</p>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel title="Raw RPC and agent trace" subtitle="This surface is optimized for high-density inspection rather than presentation.">
        {entries.length === 0 ? (
          <EmptyState title="No terminal stream connected" detail="Pipe real RPC, agent, and telemetry logs into this pane for the advanced operator view." />
        ) : (
          <div className="scrollbar-hidden max-h-112 space-y-2 overflow-y-auto pr-1 font-mono text-[13px] leading-6 text-zinc-300">
            {entries.map((entry) => (
              <div key={`${entry.timestamp}-${entry.message}`} className="rounded-2xl border border-white/8 bg-black/30 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                  <span>{entry.timestamp}</span>
                  {entry.latencyMs !== undefined ? <span>{entry.latencyMs}ms</span> : null}
                </div>
                <p className="mt-2 text-zinc-100">{entry.message}</p>
                {entry.details ? <p className="mt-1 text-zinc-400">{entry.details}</p> : null}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function ThinkingState({ animationData }: Readonly<{ animationData?: unknown }>) {
  if (!animationData) {
    return (
      <div className="rounded-3xl border border-dashed border-amber-400/25 bg-amber-400/5 p-5 text-sm text-amber-100/80">
        Lottie animation slot ready for the live “thinking” asset.
      </div>
    );
  }

  return <Lottie animationData={animationData as object} loop className="h-40" />;
}

export function NexusPage() {
  const data = useDashboardData("nexus");

  return (
    <PageFrame
      eyebrow="The Nexus"
      title="Live Command Center"
      description="A command-line and visual-graph hybrid that reflects real ElizaOS telemetry, route state, and the current Observe → Calculate → Verify → Execute cycle."
      actions={
        <>
          <TransparentButton href="/terminal">Open terminal</TransparentButton>
          <TransparentButton href="/governance-audit">Inspect audit trail</TransparentButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Agent status" value={data?.status ?? "Awaiting live telemetry"} />
        <StatCard label="Heartbeat" value={data?.heartbeat ?? "Disconnected"} />
        <StatCard label="Cognition graph" value={data?.graphLabel ?? "ElizaOS stream"} />
        <StatCard label="Mode" value="Testnet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <GlassPanel title="Thinking state" subtitle="Lottie slot for the real agent thinking animation asset.">
          <div className="scrollbar-hidden max-h-112 space-y-4 overflow-y-auto pr-1">
            <ThinkingState />
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-400">
              Connect the live ElizaOS log bridge to show actual reasoning, not a synthetic transcript.
            </div>
          </div>
        </GlassPanel>

        <NexusLogs data={data} />
      </div>
    </PageFrame>
  );
}

export function LiquidityTopologyPage() {
  const data = useDashboardData("liquidityTopology");

  return (
    <PageFrame
      eyebrow="Liquidity Topology"
      title="BNB Chain liquidity map"
      description="A topology surface for approved DEX nodes and route connectivity. The canvas only draws when live pool data is connected."
      actions={<TransparentButton href="/strategy-studio">Tune strategy</TransparentButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chain" value={data?.chainLabel ?? "BNB Chain"} />
        <StatCard label="Nodes" value={data?.nodes?.length ?? 0} />
        <StatCard label="Routes" value={data?.links?.length ?? 0} />
        <StatCard label="Status" value={data?.subtitle ?? "Waiting for pool feed"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <GlassPanel title="WebGL-ready topology canvas" subtitle="This surface is built to be swapped to a WebGL renderer once real liquidity data is wired.">
          <LiquidityTopologyCanvas nodes={data?.nodes} links={data?.links} />
        </GlassPanel>

        <GlassPanel title="DEX node registry" subtitle="Live node list for PancakeSwap, BiSwap, ApeSwap, and other approved venues.">
          {data?.nodes?.length ? (
            <div className="space-y-3">
              {data.nodes.map((node) => (
                <div key={node.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-stone-50">{node.label}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{node.dex ?? "DEX node"}</p>
                    </div>
                    <p className="font-serif text-2xl text-amber-100">{node.weight ?? 0}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No liquidity nodes connected" detail="Feed approved pool and route data into the topology layer to render the network." />
          )}
        </GlassPanel>
      </div>
    </PageFrame>
  );
}

export function StrategyStudioPage() {
  const data = useDashboardData("strategyStudio");

  return (
    <PageFrame
      eyebrow="Strategy Studio"
      title="No-code guardrail composer"
      description="Adjust SwapGuard policy components visually. Controls here are only wired to live strategy data, not fake presets."
      actions={<TransparentButton href="/safety-vault">Review guardrails</TransparentButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Controls" value={data?.controls?.length ?? 0} />
        <StatCard label="Guard rails" value={data?.guardLabels?.length ?? 0} />
        <StatCard label="Summary" value={data?.summary ?? "Awaiting draft"} />
        <StatCard label="Mode" value="Drag-and-drop" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <GlassPanel title="Policy canvas" subtitle="Move the cards to reshape live policy inputs once the strategy engine is connected.">
          <StrategyControls data={data} />
        </GlassPanel>

        <GlassPanel title="Guardrail summary" subtitle="Composable policy components should be readable at a glance by DAO operators.">
          <div className="space-y-4">
            {(data?.guardLabels ?? []).map((label) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <span className="text-zinc-300">{label}</span>
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              </div>
            ))}
            {!data?.guardLabels?.length ? (
              <EmptyState title="No guard labels connected" detail="Attach live guard metadata to explain the current slippage and route policy in plain language." />
            ) : null}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}

export function TreasuryHealthPage() {
  const data = useDashboardData("treasuryHealth");

  return (
    <PageFrame
      eyebrow="Treasury Health"
      title="Deep analytics beyond TVL"
      description="Track slippage saved, impermanent-loss mitigation, and rebalancing efficiency against live treasury telemetry."
      actions={<TransparentButton href="/simulation-sandbox">Open sandbox</TransparentButton>}
    >
      <TreasuryCharts data={data} />
    </PageFrame>
  );
}

export function SimulationSandboxPage() {
  const data = useDashboardData("simulationSandbox");

  return (
    <PageFrame
      eyebrow="Simulation Sandbox"
      title="Forked market replay"
      description="Replay the last 24 hours of behavior against a mainnet-fork Anvil environment and inspect the exact before/after state diffs."
      actions={<TransparentButton href="/governance-audit">Inspect proofs</TransparentButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fork" value={data?.forkLabel ?? "Mainnet fork pending"} />
        <StatCard label="Window" value={data?.windowLabel ?? "24h replay"} />
        <StatCard label="Runs" value={data?.runs?.length ?? 0} />
        <StatCard label="Mode" value="Anvil" />
      </div>

      <SimulationRuns data={data} />
    </PageFrame>
  );
}

export function GovernanceAuditPage() {
  const data = useDashboardData("governanceAudit");

  return (
    <PageFrame
      eyebrow="Governance & Audit"
      title="Greenfield explorer"
      description="Browse audit logs stored on BNB Greenfield and inspect the proof of intent tied to each transaction.">
      <AuditList data={data} />
    </PageFrame>
  );
}

export function SafetyVaultPage() {
  const data = useDashboardData("safetyVault");

  return (
    <PageFrame
      eyebrow="Safety Vault"
      title="Safe integration and guardrails"
      description="The vault view surfaces module permissions, active guardrails, and the current kill switch state."
      actions={<TransparentButton href="/terminal">Inspect raw traces</TransparentButton>}
    >
      <SafetyVaultView data={data} />
    </PageFrame>
  );
}

export function IncentiveArbitragePage() {
  const data = useDashboardData("incentiveArbitrageMap");

  return (
    <PageFrame
      eyebrow="Incentive Arbitrage Map"
      title="Yield hunting heatmap"
      description="Highlight live incentive surfaces across the ecosystem to show where the agent is currently looking for extra yield."
      actions={<TransparentButton href="/treasury-health">Review efficiency</TransparentButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chain" value={data?.chainLabel ?? "BNB Chain"} />
        <StatCard label="Updated" value={data?.updatedAt ?? "Awaiting feed"} />
        <StatCard label="Cells" value={data?.cells?.length ?? 0} />
        <StatCard label="Focus" value="Live yield routes" />
      </div>

      <GlassPanel title="Opportunity map" subtitle="Color intensity is derived only from connected incentive observations.">
        <HeatmapGrid data={data} />
      </GlassPanel>
    </PageFrame>
  );
}

function ReputationGauge({ score }: Readonly<{ score: number }>) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg viewBox="0 0 120 120" className="h-40 w-40">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
      <motion.circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}

export function AgentIdentityPage() {
  const data = useDashboardData("agentIdentity");
  const score = Math.max(0, Math.min(100, data?.reputationScore ?? 0));

  return (
    <PageFrame
      eyebrow="Agent Identity"
      title="BAP-578 profile"
      description="The passport of this EquiliBot instance. Identity metrics and attestations should come from verifiable sources only."
      actions={<TransparentButton href="/governance-audit">Open proofs</TransparentButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Passport" value={data?.passportId ?? "No identity feed"} />
        <StatCard label="Reputation" value={score} suffix="/100" />
        <StatCard label="Uptime" value={data?.uptime ?? "Unknown"} />
        <StatCard label="Attestations" value={data?.attestations?.length ?? 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <GlassPanel title="On-chain reputation" subtitle="A verifiable score surface for the active EquiliBot identity.">
          <div className="flex flex-col items-center gap-4 text-center">
            <ReputationGauge score={score} />
            <p className="font-serif text-4xl text-stone-50">{score}</p>
          </div>
        </GlassPanel>

        <GlassPanel title="Performance history" subtitle="The dashboard should read from the same source of truth as the operator wallet and treasury controls.">
          <div className="grid gap-4 md:grid-cols-2">
            {(data?.metrics ?? []).map((metric) => (
              <StatCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
            <div className="md:col-span-2 rounded-3xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Attestations</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data?.attestations ?? []).length ? (
                  data!.attestations!.map((item) => (
                    <span key={item} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-100">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-400">No attestations connected.</span>
                )}
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}

export function TerminalPage() {
  const data = useDashboardData("terminal");

  return <PageFrame eyebrow="Terminal" title="Advanced view" description="A keyboard-first, high-density surface for raw RPC logs and agentic system health."><TerminalView data={data} /></PageFrame>;
}
