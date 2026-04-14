"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import type { SwapIntent } from "@/lib/dashboard-data";
import { GlassPanel, StatCard } from "./ui-components";

interface SwapSimulationProps {
  intent: SwapIntent;
  onApprove?: (intent: SwapIntent) => Promise<void>;
  onReject?: (id: string, reason: string) => void;
  isExecuting?: boolean;
}

export function SwapSimulation({ intent, onApprove, onReject, isExecuting }: Readonly<SwapSimulationProps>) {
  const [isApprovingLocal, setIsApprovingLocal] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const quote = intent.quote;
  if (!quote) {
    return (
      <GlassPanel title="Swap simulation" subtitle="Awaiting quote generation...">
        <div className="flex items-center justify-center gap-3 py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          <p className="text-sm text-zinc-400">Fetching quote from {intent.quote?.route.dex}...</p>
        </div>
      </GlassPanel>
    );
  }

  const realizedSlippage = ((parseFloat(quote.outputAmount) - parseFloat(quote.minOutputAmount)) / parseFloat(quote.outputAmount)) * 100;
  const executionFee = (parseFloat(quote.route.gasEstimate?.toString() ?? "0") * 0.000000005).toFixed(6); // rough conversion

  const handleApprove = async () => {
    setIsApprovingLocal(true);
    try {
      await onApprove?.(intent);
    } catch (error) {
      console.error("Approval failed:", error);
      alert("Failed to approve swap");
    } finally {
      setIsApprovingLocal(false);
    }
  };

  const handleReject = () => {
    onReject?.(intent.id, rejectReason || "User rejected");
    setShowRejectReason(false);
  };

  return (
    <div className="space-y-6">
      {/* Safety checks */}
      <GlassPanel title="Safety verification" subtitle="Checking guardrails before execution.">
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-100">Price oracle fresh</p>
              <p className="text-xs text-green-100/60">Pyth oracle within 30s freshness window</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-100">Route whitelisted</p>
              <p className="text-xs text-green-100/60">{quote.route.dex} is approved in SwapGuard</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-100">Within daily limits</p>
              <p className="text-xs text-green-100/60">Notional {quote.outputAmount} under daily cap</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-3">
            <Clock className="h-5 w-5 flex-shrink-0 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-100">Ready for execution</p>
              <p className="text-xs text-blue-100/60">Quote valid for 60 seconds</p>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Quote details grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Input" value={`${intent.amountIn} ${intent.tokenIn.symbol}`} />
        <StatCard label="Expected output" value={`${quote.outputAmount} ${intent.tokenOut.symbol}`} />
        <StatCard label="Min output" value={`${quote.minOutputAmount} ${intent.tokenOut.symbol}`} />
        <StatCard label="Price impact" value={`${quote.priceImpact?.toFixed(2)}%`} />
      </div>

      {/* Before/after simulation */}
      <div className="grid gap-6 xl:grid-cols-2">
        <GlassPanel title="Balance before" subtitle="Current treasury state.">
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{intent.tokenIn.symbol}</p>
              <p className="mt-2 font-mono text-lg text-stone-50">{intent.amountIn}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{intent.tokenOut.symbol}</p>
              <p className="mt-2 font-mono text-lg text-stone-50">5000.00</p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel title="Balance after" subtitle="State after swap execution.">
          <div className="space-y-3">
            <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-green-400">{intent.tokenIn.symbol}</p>
              <p className="mt-2 font-mono text-lg text-green-100">
                {(parseFloat(intent.amountIn) - parseFloat(intent.amountIn)).toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-green-400">{intent.tokenOut.symbol}</p>
              <p className="mt-2 font-mono text-lg text-green-100">
                {(5000 + parseFloat(quote.outputAmount)).toFixed(2)}
              </p>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Execution details */}
      <GlassPanel title="Execution details" subtitle="What happens when you approve.">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className="text-zinc-400">Realized slippage</span>
            <span className="font-mono text-amber-400">{realizedSlippage.toFixed(3)}%</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className="text-zinc-400">Execution fee (gas)</span>
            <span className="font-mono text-zinc-300">{executionFee} BNB</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className="text-zinc-400">Execution method</span>
            <span className="font-mono text-zinc-300">Safe transaction → SwapGuard</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className="text-zinc-400">Deadline</span>
            <span className="font-mono text-zinc-300">+5 minutes</span>
          </div>
        </div>
      </GlassPanel>

      {/* Action buttons */}
      <div className="flex gap-3">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleApprove}
          disabled={isApprovingLocal || isExecuting}
          className="flex-1 rounded-2xl bg-green-600 px-4 py-3 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-green-500"
        >
          {isApprovingLocal || isExecuting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              Submitting to Safe...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap className="h-4 w-4" />
              Approve & Execute
            </span>
          )}
        </motion.button>

        <button
          onClick={() => setShowRejectReason(true)}
          disabled={isApprovingLocal || isExecuting}
          className="rounded-2xl border border-white/10 px-4 py-3 font-medium text-zinc-300 transition hover:border-red-400/30 hover:bg-red-400/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {/* Reject reason modal */}
      {showRejectReason && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRejectReason(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-3xl border border-white/10 bg-black/90 p-6 shadow-xl w-96"
          >
            <p className="text-sm font-medium text-stone-50 mb-4">Why are you rejecting this swap?</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason (optional)"
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:border-amber-400/30 focus:outline-none"
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleReject}
                className="flex-1 rounded-2xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <XCircle className="h-4 w-4 inline mr-2" />
                Confirm Reject
              </button>
              <button
                onClick={() => setShowRejectReason(false)}
                className="flex-1 rounded-2xl border border-white/10 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-white/20"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
