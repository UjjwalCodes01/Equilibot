"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, AlertCircle, ExternalLink } from "lucide-react";
import type { SwapIntent } from "@/lib/dashboard-data";
import { GlassPanel, StatCard } from "./ui-components";

interface SwapExecutionProps {
  intent: SwapIntent;
  onReset?: () => void;
}

function isRealTxHash(value?: string): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value));
}

export function SwapExecution({ intent, onReset }: Readonly<SwapExecutionProps>) {
  const [executionPhase, setExecutionPhase] = useState<"waiting-safe" | "confirmed" | "on-chain" | "complete">("waiting-safe");
  const [confirmations, setConfirmations] = useState(0);

  // Simulate status progression
  useEffect(() => {
    const timer1 = setTimeout(() => setExecutionPhase("confirmed"), 3000);
    const timer2 = setTimeout(() => {
      setExecutionPhase("on-chain");
      setConfirmations(1);
    }, 6000);
    const timer3 = setTimeout(() => setConfirmations(2), 8000);
    const timer4 = setTimeout(() => {
      setConfirmations(3);
      setExecutionPhase("complete");
    }, 10000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  const isComplete = executionPhase === "complete";
  const isOnChain = executionPhase === "on-chain" || isComplete;

  return (
    <div className="space-y-6">
      {/* Execution status timeline */}
      <GlassPanel title="Execution status" subtitle="Real-time transaction flow tracking.">
        <div className="space-y-4">
          <TimelineStep
            number={1}
            label="Safe wallet review"
            detail="Waiting for signers to approve"
            isActive={executionPhase === "waiting-safe"}
            isComplete={executionPhase !== "waiting-safe"}
          />

          <TimelineStep
            number={2}
            label="Transaction signed"
            detail="Safe confirmed the transaction bundle"
            isActive={executionPhase === "confirmed"}
            isComplete={executionPhase !== "waiting-safe" && executionPhase !== "confirmed"}
          />

          <TimelineStep
            number={3}
            label="Swap executing on-chain"
            detail={isOnChain ? `${confirmations}/3 blocks confirmed` : "Pending blockchain confirmation"}
            isActive={executionPhase === "on-chain"}
            isComplete={isComplete}
          />

          <TimelineStep
            number={4}
            label="Execution complete"
            detail={isComplete ? `TX: ${intent.onChainTxHash?.slice(0, 10)}...` : "Awaiting finality"}
            isActive={false}
            isComplete={isComplete}
          />
        </div>
      </GlassPanel>

      {/* Safe transaction info */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Safe TX" value={intent.safeTransactionHash ? intent.safeTransactionHash.slice(0, 10) + "..." : "Pending"} />
        <StatCard label="Status" value={executionPhase.replace("-", " ").toUpperCase()} />
        <StatCard label="Route" value={intent.quote?.route.dex ?? "---"} />
        <StatCard label="Confirmations" value={`${confirmations}/3`} />
      </div>

      {/* Live transaction details */}
      {isOnChain && (
        <GlassPanel title="On-chain execution" subtitle="Real-time swap details from blockchain.">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
              <span className="text-zinc-400">Input confirmed</span>
              <span className="font-mono text-green-400">{intent.amountIn} {intent.tokenIn.symbol}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
              <span className="text-zinc-400">Output received</span>
              <span className="font-mono text-green-400">{intent.quote?.outputAmount} {intent.tokenOut.symbol}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
              <span className="text-zinc-400">Actual slippage</span>
              <span className="font-mono text-amber-400">
                {intent.quote?.priceImpact?.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
              <span className="text-zinc-400">Gas paid</span>
              <span className="font-mono text-zinc-300">0.0025 BNB (~$0.82)</span>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Success message */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-green-400/30 bg-green-400/10 p-6"
        >
          <div className="flex gap-4">
              <CheckCircle className="h-6 w-6 shrink-0 text-green-400" />
            <div>
              <h3 className="font-medium text-green-100 mb-1">Swap executed successfully</h3>
              <p className="text-sm text-green-100/60 mb-4">
                Your treasury has been rebalanced. New positions update in real-time on the Treasury Health dashboard.
              </p>
              <div className="flex gap-2">
                {isRealTxHash(intent.onChainTxHash) ? (
                  <a
                    href={`https://bscscan.com/tx/${intent.onChainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-green-400 hover:text-green-300"
                  >
                    View on BSCScan
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
                    Demo mode: no on-chain hash available
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Action button */}
      {isComplete && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onReset}
          className="w-full rounded-2xl bg-amber-400 px-4 py-3 font-medium text-black transition hover:bg-amber-300"
        >
          Create another swap
        </motion.button>
      )}

      {/* Execution audit trail */}
      <GlassPanel title="Audit trail" subtitle="Complete execution history and verification.">
        <div className="space-y-2 text-xs font-mono text-zinc-400">
          <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Intent draft created</div>
          <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Quote fetched from {intent.quote?.route.dex}</div>
          <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Safety checks passed</div>
          <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Approved by user</div>
          {intent.safeTransactionHash && <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Safe transaction reference: {intent.safeTransactionHash}</div>}
          {intent.onChainTxHash && <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] On-chain: {intent.onChainTxHash.slice(0, 10)}...</div>}
          {isComplete && <div>[{new Date().toISOString().split("T")[1].split(".")[0]}] Execution finalized</div>}
        </div>
      </GlassPanel>
    </div>
  );
}

interface TimelineStepProps {
  number: number;
  label: string;
  detail: string;
  isActive: boolean;
  isComplete: boolean;
}

function TimelineStep({ number, label, detail, isActive, isComplete }: Readonly<TimelineStepProps>) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <motion.div
          animate={{
            backgroundColor: isComplete ? "#16a34a" : isActive ? "#b45309" : "#3f3f46",
          }}
          className="h-10 w-10 rounded-full border border-white/10 flex items-center justify-center"
        >
          {isComplete ? (
            <CheckCircle className="h-5 w-5 text-green-400" />
          ) : isActive ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity }} className="h-5 w-5">
              <Clock className="h-5 w-5 text-amber-400" />
            </motion.div>
          ) : (
            <span className="text-xs font-semibold text-zinc-500">{number}</span>
          )}
        </motion.div>
        {number < 4 && <div className="mt-2 h-8 w-0.5 bg-white/10" />}
      </div>
      <div className="pt-2">
        <p className={`font-medium ${isActive ? "text-amber-400" : isComplete ? "text-green-400" : "text-zinc-500"}`}>{label}</p>
        <p className="text-xs text-zinc-500 mt-1">{detail}</p>
      </div>
    </div>
  );
}
