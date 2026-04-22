'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { CONTRACT_ADDRESSES, EXPLORER_ADDRESS_URL } from '@/lib/contracts/config'
import { useAccount } from 'wagmi'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Wallet,
  ArrowRight,
  Shield,
  Zap,
  Eye,
  ExternalLink,
  Sparkles,
  FlaskConical,
  Bot,
  Lock,
  TrendingUp,
  CheckCircle,
} from 'lucide-react'

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }

export default function DemoPage() {
  const { isConnected } = useAccount()

  return (
    <>
      <Topbar title="Welcome" />
      <PageWrapper>
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-panel p-8 md:p-12 gradient-border relative overflow-hidden text-center"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gold-500/5 rounded-full blur-[100px]" />
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center mx-auto mb-6 glow-gold">
              <Bot className="w-10 h-10 text-space-950" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold gold-gradient mb-3">
              Welcome to EquiliBot
            </h1>
            <p className="text-base text-mist max-w-2xl mx-auto leading-relaxed">
              An autonomous, non-custodial AI treasury executive for BNB Chain DAOs.
              It watches the market 24/7, calculates rebalancing math, and executes trades
              through policy-gated smart contracts — all without human intervention.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Link
                href="/nexus"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-sm font-semibold hover:from-gold-400 hover:to-gold-500 transition-all"
                id="go-to-nexus"
              >
                <Zap className="w-4 h-4" />
                Open Command Center
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/sandbox"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-glass-border text-arctic text-sm font-medium hover:bg-glass-hover transition-all"
                id="go-to-sandbox"
              >
                <FlaskConical className="w-4 h-4" />
                Try Interactive Demo
              </Link>
            </div>
          </div>
        </motion.div>

        {/* How to Test — 3 Steps */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mt-8"
        >
          <h2 className="text-lg font-semibold text-arctic text-center mb-6">
            <Sparkles className="w-5 h-5 inline-block mr-2 text-gold-500" />
            How to Test EquiliBot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: 1,
                title: 'Connect Your Wallet',
                desc: 'Click the "Connect Wallet" button in the top-right corner. Make sure MetaMask is set to BSC Testnet (Chain ID 97). You\'ll need some testnet tBNB.',
                icon: Wallet,
                color: 'text-indigo-glow',
                bg: 'bg-indigo-glow/10',
                done: isConnected,
              },
              {
                step: 2,
                title: 'Fund the Treasury',
                desc: 'Go to the Sandbox page and click "Send 0.05 tBNB → Treasury". This sends testnet BNB to the agent\'s Gnosis Safe, triggering a portfolio imbalance.',
                icon: TrendingUp,
                color: 'text-amber-glow',
                bg: 'bg-amber-glow/10',
                done: false,
              },
              {
                step: 3,
                title: 'Watch the Agent React',
                desc: 'Go to The Nexus and watch the Agent Thought Stream light up. The bot detects the imbalance, calculates the math, and autonomously proposes a rebalance trade.',
                icon: Eye,
                color: 'text-emerald-glow',
                bg: 'bg-emerald-glow/10',
                done: false,
              },
            ].map((s) => (
              <motion.div
                key={s.step}
                variants={item}
                className="glass-panel p-6 relative overflow-hidden group hover:scale-[1.02] transition-transform"
              >
                <div className="absolute top-3 right-3 text-[60px] font-bold text-mist/5 select-none">
                  {s.step}
                </div>
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4', s.bg)}>
                  {s.done ? (
                    <CheckCircle className="w-6 h-6 text-emerald-glow" />
                  ) : (
                    <s.icon className={cn('w-6 h-6', s.color)} />
                  )}
                </div>
                <h3 className="text-sm font-semibold text-arctic mb-2">{s.title}</h3>
                <p className="text-xs text-mist/80 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Architecture Explainer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel p-6"
          >
            <h3 className="text-sm font-semibold text-arctic mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-glow" />
              How It Works — Under the Hood
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Treasury Vault', desc: 'Funds live in a Gnosis Safe multisig — not in any personal wallet.', icon: Lock },
                { label: 'AI Agent', desc: 'A Node.js backend watches markets 24/7 and signs transactions with a secure server-side key.', icon: Bot },
                { label: 'SwapGuard', desc: 'An on-chain smart contract enforces slippage limits, token allowlists, and cooldowns on every trade.', icon: Shield },
                { label: 'Transparency', desc: 'Every decision is logged to an immutable audit trail. Nothing is hidden.', icon: Eye },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-space-900/50">
                  <row.icon className="w-4 h-4 text-gold-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-arctic">{row.label}</p>
                    <p className="text-[11px] text-mist/70">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Deployed Contracts */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel p-6"
          >
            <h3 className="text-sm font-semibold text-arctic mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-gold-500" />
              Deployed Contracts (BSC Testnet)
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Gnosis Safe (Treasury)', address: CONTRACT_ADDRESSES.safe },
                { label: 'EquiliBotModule', address: CONTRACT_ADDRESSES.module },
                { label: 'SwapGuard', address: CONTRACT_ADDRESSES.guard },
              ].map((contract) => (
                <a
                  key={contract.label}
                  href={`${EXPLORER_ADDRESS_URL}${contract.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between py-3 px-4 rounded-xl bg-space-900/50 hover:bg-space-700/50 transition-colors group"
                >
                  <div>
                    <p className="text-xs font-medium text-arctic">{contract.label}</p>
                    <p className="text-[10px] text-mist font-mono mt-0.5">{contract.address}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-mist group-hover:text-gold-400 transition-colors" />
                </a>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-glass-border">
              <p className="text-[10px] text-mist/60 leading-relaxed">
                All contracts are verified on BSCScan. The agent operates exclusively through
                the EquiliBotModule, which is enabled as a module on the Gnosis Safe. The SwapGuard
                acts as a transaction guard enforcing on-chain policy constraints.
              </p>
            </div>
          </motion.div>
        </div>
      </PageWrapper>
    </>
  )
}
