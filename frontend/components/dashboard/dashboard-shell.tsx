"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  Activity,
  Aperture,
  BarChart3,
  Binary,
  FileScan,
  Layers3,
  LockKeyhole,
  Network,
  Sparkles,
  SquareTerminal,
  Shield,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { DashboardRouteKey } from "@/lib/dashboard-data";

type NavItem = {
  key: DashboardRouteKey;
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { key: "nexus", href: "/nexus", label: "Nexus", icon: Network },
  { key: "liquidity-topology", href: "/liquidity-topology", label: "Liquidity Topology", icon: Layers3 },
  { key: "strategy-studio", href: "/strategy-studio", label: "Strategy Studio", icon: Sparkles },
  { key: "treasury-health", href: "/treasury-health", label: "Treasury Health", icon: BarChart3 },
  { key: "simulation-sandbox", href: "/simulation-sandbox", label: "Simulation Sandbox", icon: Binary },
  { key: "governance-audit", href: "/governance-audit", label: "Governance & Audit", icon: FileScan },
  { key: "safety-vault", href: "/safety-vault", label: "Safety Vault", icon: Shield },
  { key: "incentive-arbitrage-map", href: "/incentive-arbitrage-map", label: "Arbitrage Map", icon: Aperture },
  { key: "agent-identity", href: "/agent-identity", label: "Agent Identity", icon: Activity },
  { key: "terminal", href: "/terminal", label: "Terminal", icon: SquareTerminal },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const preferredConnector = connectors.find((connector) => connector.id.includes("injected")) ?? connectors[0];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(194,140,34,0.12),_transparent_28%),linear-gradient(180deg,_#090909_0%,_#111111_42%,_#0d0d0d_100%)] text-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:88px_88px] opacity-20" />
      <div className="relative grid min-h-screen lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-white/5 p-5 backdrop-blur-2xl lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="rounded-[28px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">EquiliBot</p>
                <h1 className="font-serif text-2xl text-stone-50">The Sovereign Executive</h1>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
              Testnet-first command surface for autonomous treasury control.
            </div>

            <nav className="mt-5 space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${active ? "border-amber-400/40 bg-amber-400/10 text-amber-100 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : "border-white/5 bg-white/0 text-zinc-300 hover:border-white/10 hover:bg-white/5"}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-amber-300" : "text-zinc-500"}`} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-5 rounded-[22px] border border-amber-400/20 bg-amber-400/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.32em] text-amber-200/75">Execution Mode</p>
              <p className="mt-1 font-serif text-xl text-amber-50">Canary / Observe</p>
              <p className="mt-2 text-sm leading-6 text-amber-100/75">
                Safe module and guardrails remain operator-visible. No hidden state.
              </p>
            </div>
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-col">
          <header className="border-b border-white/10 bg-black/20 px-6 py-5 backdrop-blur-xl md:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-amber-200/70">EquiliBot Dashboard</p>
                <h2 className="mt-2 font-serif text-3xl text-stone-50 md:text-4xl">Command interface for autonomous DAO treasury control</h2>
                <div className="mt-3">
                  {isConnected && address ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                        <Wallet className="h-3.5 w-3.5" />
                        {shortenAddress(address)}
                      </span>
                      <button
                        type="button"
                        onClick={() => disconnect()}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-100"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!preferredConnector || isPending}
                      onClick={() => preferredConnector && connect({ connector: preferredConnector })}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      {isPending ? "Connecting..." : preferredConnector ? "Connect Wallet" : "Wallet Not Found"}
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["On-chain state", "Live hooks"],
                  ["Agent telemetry", "ElizaOS stream"],
                  ["Audit posture", "Proof of intent"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">{label}</p>
                    <p className="mt-1 text-sm text-stone-50">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex-1 px-4 py-5 md:px-8 md:py-8"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
