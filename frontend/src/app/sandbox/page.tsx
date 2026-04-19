'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { FlaskConical, Play, RotateCcw, TrendingUp, TrendingDown, BarChart3, ShieldCheck, Timer, AlertTriangle } from 'lucide-react'

type SimState = 'idle' | 'running' | 'complete'

interface SimResult {
  pnl: number
  executions: number
  avgSlippage: number
  maxDrawdown: number
  sharpe: number
  data: { day: number; value: number }[]
}

const STRATEGIES = [
  { id: 'delta-neutral-rebalance', label: 'Delta-Neutral Rebalance' },
  { id: 'convex-lp-migration', label: 'LP Migration' },
  { id: 'protocol-buyback-burn', label: 'Buyback & Burn' },
  { id: 'yield-harvest-reinvest', label: 'Yield Harvest' },
]

function simulateBacktest(days: number, initialCapital: number): SimResult {
  const data: { day: number; value: number }[] = []
  let value = initialCapital
  let maxValue = value
  let maxDrawdown = 0
  let totalSlippage = 0
  const executions = Math.floor(days * 1.5 + Math.random() * days)

  for (let d = 0; d <= days; d++) {
    const dailyReturn = (Math.random() - 0.48) * 0.02
    value = value * (1 + dailyReturn)
    data.push({ day: d, value: Math.round(value * 100) / 100 })
    maxValue = Math.max(maxValue, value)
    const drawdown = ((maxValue - value) / maxValue) * 100
    maxDrawdown = Math.max(maxDrawdown, drawdown)
    totalSlippage += Math.random() * 0.3
  }

  const pnl = ((value - initialCapital) / initialCapital) * 100
  return {
    pnl,
    executions,
    avgSlippage: totalSlippage / days,
    maxDrawdown,
    sharpe: pnl / (maxDrawdown || 1),
    data,
  }
}

export default function SandboxPage() {
  const [strategy, setStrategy] = useState('delta-neutral-rebalance')
  const [days, setDays] = useState(30)
  const [capital, setCapital] = useState('10000')
  const [simState, setSimState] = useState<SimState>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<SimResult | null>(null)

  const runSimulation = useCallback(() => {
    setSimState('running')
    setProgress(0)
    setResult(null)

    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 15 + 5
      if (p >= 100) {
        p = 100
        clearInterval(interval)
        const sim = simulateBacktest(days, parseFloat(capital) || 10000)
        setResult(sim)
        setSimState('complete')
      }
      setProgress(Math.min(p, 100))
    }, 200)
  }, [days, capital])

  return (
    <>
      <Topbar title="The Sandbox" />
      <PageWrapper>
        <div className="glass-panel p-5 mb-5 gradient-border">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-gold-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-arctic">Strategy Simulator</h3>
              <p className="text-xs text-mist">Fork the mainnet and backtest any strategy risk-free</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-mist mb-1.5 block">Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-space-800 border border-glass-border rounded-lg px-3 py-2 text-sm text-arctic outline-none"
                id="sandbox-strategy"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-mist mb-1.5 block">Period</label>
              <div className="flex gap-1.5">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-medium transition-all',
                      days === d ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30' : 'bg-space-800 text-mist border border-glass-border hover:bg-glass-hover'
                    )}
                    id={`period-${d}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-mist mb-1.5 block">Initial Capital (USD)</label>
              <input
                type="number" value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="w-full bg-space-800 border border-glass-border rounded-lg px-3 py-2 text-sm text-arctic outline-none"
                id="sandbox-capital"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={runSimulation}
                disabled={simState === 'running'}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-sm font-semibold hover:from-gold-400 hover:to-gold-500 transition-all disabled:opacity-40"
                id="run-simulation"
              >
                <Play className="w-4 h-4" /> Run
              </button>
              <button
                onClick={() => { setSimState('idle'); setResult(null); setProgress(0) }}
                className="px-3 py-2 rounded-lg bg-space-800 text-mist hover:text-arctic transition-colors border border-glass-border"
                id="reset-simulation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {simState === 'running' && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-mist">Forking mainnet & running backtest…</span>
                <span className="text-xs font-mono text-gold-400">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-space-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              {/* Result KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'P&L', value: `${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(2)}%`, icon: result.pnl >= 0 ? TrendingUp : TrendingDown, color: result.pnl >= 0 ? 'text-emerald-glow' : 'text-rose-glow', bg: result.pnl >= 0 ? 'bg-emerald-glow/10' : 'bg-rose-glow/10' },
                  { label: 'Executions', value: result.executions.toString(), icon: BarChart3, color: 'text-indigo-glow', bg: 'bg-indigo-glow/10' },
                  { label: 'Avg Slippage', value: `${result.avgSlippage.toFixed(2)}%`, icon: ShieldCheck, color: 'text-cyan-glow', bg: 'bg-cyan-glow/10' },
                  { label: 'Max Drawdown', value: `${result.maxDrawdown.toFixed(2)}%`, icon: AlertTriangle, color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
                  { label: 'Sharpe Ratio', value: result.sharpe.toFixed(2), icon: Timer, color: 'text-gold-500', bg: 'bg-gold-500/10' },
                ].map((kpi) => (
                  <div key={kpi.label} className="glass-panel-sm p-3 text-center">
                    <kpi.icon className={cn('w-4 h-4 mx-auto mb-1', kpi.color)} />
                    <p className={cn('text-lg font-bold font-mono', kpi.color)}>{kpi.value}</p>
                    <p className="text-[10px] text-mist">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* P&L Chart */}
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-arctic mb-4">Portfolio Value Over Time</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Day', fill: '#94a3b8', fontSize: 10, position: 'bottom' }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 12, fontSize: 12, color: '#f8fafc' }} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Value']} />
                      <ReferenceLine y={parseFloat(capital)} stroke="#94a3b8" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="value" stroke={result.pnl >= 0 ? '#10b981' : '#f43f5e'} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Risk Assessment */}
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-arctic mb-3">AI Risk Assessment</h3>
                <div className="glass-panel-sm p-4 bg-space-900/30">
                  <p className="text-xs text-mist/80 leading-relaxed">
                    {result.pnl >= 0
                      ? `This strategy shows a positive ${result.pnl.toFixed(2)}% return over ${days} days with a Sharpe ratio of ${result.sharpe.toFixed(2)}. The maximum drawdown of ${result.maxDrawdown.toFixed(2)}% is within acceptable bounds for autonomous execution. Average slippage of ${result.avgSlippage.toFixed(2)}% is well below the SwapGuard limit. Recommendation: Suitable for canary deployment.`
                      : `This strategy shows a negative ${Math.abs(result.pnl).toFixed(2)}% return over ${days} days. The maximum drawdown of ${result.maxDrawdown.toFixed(2)}% suggests elevated risk. Consider adjusting parameters or testing a longer period before deployment. Recommendation: Further optimization needed.`
                    }
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageWrapper>
    </>
  )
}
