"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { dashboardWagmiConfig } from "@/lib/web3";

const queryClient = new QueryClient();

export function AppProviders({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WagmiProvider config={dashboardWagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}