"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, AlertCircle, Zap } from "lucide-react";
import type { Token, DEXRoute, SwapIntent, StrategyStudioData } from "@/lib/dashboard-data";
import { GlassPanel } from "./ui-components";

interface SwapIntentFormProps {
  data?: StrategyStudioData;
  onSubmit?: (intent: Partial<SwapIntent>) => Promise<void>;
  isLoading?: boolean;
}

// Mock token list - in production, fetch from on-chain registry
const AVAILABLE_TOKENS: Token[] = [
  { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cbaAFc2141F2d36e3524c0", decimals: 18, balance: "10.5" },
  { symbol: "BUSD", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18, balance: "5000" },
  { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, balance: "2500" },
  { symbol: "ETH", address: "0x2170ed0880ac9a755fd29b2688956bd959cf021d", decimals: 18, balance: "0.5" },
  { symbol: "BTC", address: "0x7130d2a12b9bcbfdd356a74b51275e7db54681e7", decimals: 18, balance: "0.02" },
];

// Mock DEX routes - in production, fetch from DEX aggregator
const MOCK_ROUTES: DEXRoute[] = [
  {
    id: "pancakeswap-v3",
    dex: "PancakeSwap V3",
    path: [AVAILABLE_TOKENS[0], AVAILABLE_TOKENS[1]],
    gasEstimate: 180000,
    priceImpact: 0.12,
  },
  {
    id: "pancakeswap-v2",
    dex: "PancakeSwap V2",
    path: [AVAILABLE_TOKENS[0], AVAILABLE_TOKENS[1]],
    gasEstimate: 150000,
    priceImpact: 0.25,
  },
  {
    id: "bnbx-stable",
    dex: "StableSwap",
    path: [AVAILABLE_TOKENS[0], AVAILABLE_TOKENS[1]],
    gasEstimate: 120000,
    priceImpact: 0.08,
  },
];

export function SwapIntentForm({ data, onSubmit, isLoading }: Readonly<SwapIntentFormProps>) {
  const [tokenIn, setTokenIn] = useState<Token | null>(AVAILABLE_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<Token | null>(AVAILABLE_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [slippageTolerance, setSlippageTolerance] = useState(0.5);
  const [selectedRoute, setSelectedRoute] = useState<DEXRoute | null>(MOCK_ROUTES[0]);
  const [showTokenSelect, setShowTokenSelect] = useState<"in" | "out" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSwapTokens = () => {
    const tmp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tmp);
  };

  const handleSubmit = async () => {
    if (!tokenIn || !tokenOut || !amountIn || !selectedRoute) {
      alert("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit?.({
        id: `swap-${Date.now()}`,
        tokenIn,
        tokenOut,
        amountIn,
        slippageTolerance,
        status: "simulating",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Swap submission failed:", error);
      alert("Failed to submit swap intent");
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedOutput = amountIn
    ? (parseFloat(amountIn) * 1.95 * (1 - (selectedRoute?.priceImpact ?? 0) / 100)).toFixed(2)
    : "0";
  const minOutput = (parseFloat(estimatedOutput) * (1 - slippageTolerance / 100)).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Token pair and amount section */}
      <GlassPanel title="Swap parameters" subtitle="Select tokens, amount, and preferred route.">
        <div className="space-y-4">
          {/* Token In */}
          <div className="relative">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">From</label>
            <button
              onClick={() => setShowTokenSelect("in")}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-left transition hover:border-white/20 hover:bg-black/40"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-stone-50">{tokenIn?.symbol ?? "Select token"}</p>
                  <p className="text-xs text-zinc-500">Balance: {tokenIn?.balance ?? "0"}</p>
                </div>
                <span className="text-xs text-zinc-400">▼</span>
              </div>
            </button>
            {showTokenSelect === "in" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full z-50 mt-2 w-full rounded-2xl border border-white/10 bg-black/95 p-2 shadow-lg"
              >
                {AVAILABLE_TOKENS.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => {
                      setTokenIn(token);
                      setShowTokenSelect(null);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/10"
                  >
                    {token.symbol} (Balance: {token.balance})
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Amount In */}
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Amount</label>
            <input
              type="number"
              placeholder="0.00"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-stone-50 placeholder-zinc-600 transition focus:border-amber-400/30 focus:outline-none focus:ring-1 focus:ring-amber-400/20"
            />
          </div>

          {/* Swap direction button */}
          <div className="flex justify-center py-2">
            <button
              onClick={handleSwapTokens}
              className="rounded-full border border-white/10 bg-black/50 p-2 transition hover:border-amber-400/30 hover:bg-amber-400/5"
            >
              <ArrowDown className="h-5 w-5 text-amber-400" />
            </button>
          </div>

          {/* Token Out */}
          <div className="relative">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">To</label>
            <button
              onClick={() => setShowTokenSelect("out")}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-left transition hover:border-white/20 hover:bg-black/40"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-stone-50">{tokenOut?.symbol ?? "Select token"}</p>
                  <p className="text-xs text-zinc-500">Est. output: {estimatedOutput}</p>
                </div>
                <span className="text-xs text-zinc-400">▼</span>
              </div>
            </button>
            {showTokenSelect === "out" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full z-50 mt-2 w-full rounded-2xl border border-white/10 bg-black/95 p-2 shadow-lg"
              >
                {AVAILABLE_TOKENS.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => {
                      setTokenOut(token);
                      setShowTokenSelect(null);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/10"
                  >
                    {token.symbol}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Route and slippage settings */}
      <div className="grid gap-6 xl:grid-cols-2">
        <GlassPanel title="DEX routes" subtitle="Choose best route for price and gas.">
          <div className="space-y-2">
            {MOCK_ROUTES.map((route) => (
              <button
                key={route.id}
                onClick={() => setSelectedRoute(route)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  selectedRoute?.id === route.id
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-50">{route.dex}</p>
                    <p className="text-xs text-zinc-500">Impact: {route.priceImpact?.toFixed(2)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">{route.gasEstimate?.toLocaleString()} gas</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel title="Safety settings" subtitle="Configure execution guardrails.">
          <div className="space-y-4">
            <div>
              <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-400">
                <span>Slippage tolerance</span>
                <span className="font-serif text-base text-amber-400">{slippageTolerance}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={slippageTolerance}
                onChange={(e) => setSlippageTolerance(parseFloat(e.target.value))}
                className="mt-3 w-full accent-amber-400"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Min output</p>
              <p className="mt-2 font-serif text-lg text-stone-50">{minOutput}</p>
              <p className="text-xs text-zinc-500">{tokenOut?.symbol}</p>
            </div>

            <div className="flex gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
              <p className="text-xs leading-5 text-amber-100/70">
                Swap will pass through SwapGuard before Safe execution. Your min output will be enforced on-chain.
              </p>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Submit button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleSubmit}
        disabled={isSubmitting || isLoading || !amountIn}
        className={`w-full rounded-2xl px-4 py-3 font-medium text-black transition ${
          isSubmitting || isLoading || !amountIn
            ? "cursor-not-allowed bg-zinc-600"
            : "bg-amber-400 hover:bg-amber-300"
        }`}
      >
        {isSubmitting || isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            Simulating swap...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Zap className="h-4 w-4" />
            Simulate & Review
          </span>
        )}
      </motion.button>
    </div>
  );
}
