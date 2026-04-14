"use client";

import { useState, useCallback } from "react";
import type { SwapIntent, SwapQuote } from "@/lib/dashboard-data";

export type SwapFlowStage = "draft" | "simulating" | "simulated" | "executing" | "executed" | "rejected";

interface UseSwapIntentReturn {
  activeIntent: SwapIntent | null;
  stage: SwapFlowStage;
  isLoading: boolean;
  error: string | null;
  history: SwapIntent[];
  
  // Actions
  submitSwapDraft: (draft: Partial<SwapIntent>) => Promise<void>;
  approveSwap: (intent: SwapIntent) => Promise<void>;
  rejectSwap: (id: string, reason: string) => void;
  clearDraft: () => void;
  resetFlow: () => void;
}

export function useSwapIntent(): UseSwapIntentReturn {
  const [activeIntent, setActiveIntent] = useState<SwapIntent | null>(null);
  const [stage, setStage] = useState<SwapFlowStage>("draft");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SwapIntent[]>([]);

  const createDemoTransactionRef = (prefix: string) => `${prefix}-${Date.now()}`;

  const submitSwapDraft = useCallback(async (draft: Partial<SwapIntent>) => {
    try {
      setIsLoading(true);
      setError(null);
      setStage("simulating");

      // In production, call actual backend API
      const mockIntent: SwapIntent = {
        id: draft.id ?? `swap-${Date.now()}`,
        tokenIn: draft.tokenIn!,
        tokenOut: draft.tokenOut!,
        amountIn: draft.amountIn ?? "0",
        slippageTolerance: draft.slippageTolerance ?? 0.5,
        status: "simulating",
        createdAt: draft.createdAt ?? new Date().toISOString(),
      };

      setActiveIntent(mockIntent);

      // Simulate API delay for quote fetching
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate mock quote
      const mockQuote: SwapQuote = {
        inputAmount: draft.amountIn ?? "0",
        outputAmount: (parseFloat(draft.amountIn ?? "0") * 1.95).toFixed(2),
        minOutputAmount: (parseFloat(draft.amountIn ?? "0") * 1.95 * (1 - (draft.slippageTolerance ?? 0.5) / 100)).toFixed(2),
        priceImpact: 0.12,
        route: {
          id: "pancakeswap-v3",
          dex: "PancakeSwap V3",
          path: [draft.tokenIn!, draft.tokenOut!],
          gasEstimate: 180000,
          priceImpact: 0.12,
        },
        updatedAt: new Date().toISOString(),
      };

      const simulatedIntent: SwapIntent = {
        ...mockIntent,
        quote: mockQuote,
        status: "simulated",
      };

      setActiveIntent(simulatedIntent);
      setStage("simulated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to simulate swap";
      setError(msg);
      setStage("draft");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const approveSwap = useCallback(
    async (intent: SwapIntent) => {
      try {
        setIsLoading(true);
        setError(null);
        setStage("executing");

        // In production, call Safe API to submit transaction
        // For now, simulate submission
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const executingIntent: SwapIntent = {
          ...intent,
          safeTransactionHash: createDemoTransactionRef("safe-tx"),
          status: "executing",
        };

        setActiveIntent(executingIntent);

        // Simulate on-chain confirmation
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const executedIntent: SwapIntent = {
          ...executingIntent,
          status: "executed",
        };

        setActiveIntent(executedIntent);
        setStage("executed");

        // Add to history
        setHistory((prev) => [executedIntent, ...prev]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to execute swap";
        setError(msg);
        setStage("simulated");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const rejectSwap = useCallback((id: string, reason: string) => {
    setActiveIntent((prev) =>
      prev && prev.id === id
        ? {
            ...prev,
            status: "rejected",
            reason,
          }
        : prev
    );
    setStage("draft");
  }, []);

  const clearDraft = useCallback(() => {
    setActiveIntent(null);
    setStage("draft");
    setError(null);
  }, []);

  const resetFlow = useCallback(() => {
    setActiveIntent(null);
    setStage("draft");
    setError(null);
  }, []);

  return {
    activeIntent,
    stage,
    isLoading,
    error,
    history,
    submitSwapDraft,
    approveSwap,
    rejectSwap,
    clearDraft,
    resetFlow,
  };
}
