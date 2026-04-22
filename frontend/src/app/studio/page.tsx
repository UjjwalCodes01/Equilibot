'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { useTriggerTask } from '@/hooks/use-telemetry'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useState, useCallback } from 'react'
import { Blocks, TrendingUp, ShieldCheck, Zap, ArrowDown, Play, Loader2, Plus, Trash2, Code, ChevronDown, Sparkles } from 'lucide-react'

interface Block {
  id: string
  type: 'trigger' | 'condition' | 'action' | 'guard'
  label: string
  config: Record<string, string>
}

const PALETTE = [
  { type: 'trigger' as const, label: 'Price Deviation > X bps', icon: TrendingUp, color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
  { type: 'trigger' as const, label: 'Balance Drift > X%', icon: TrendingUp, color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
  { type: 'trigger' as const, label: 'Time Interval', icon: TrendingUp, color: 'text-amber-glow', bg: 'bg-amber-glow/10' },
  { type: 'condition' as const, label: 'Oracle Price Fresh', icon: ShieldCheck, color: 'text-cyan-glow', bg: 'bg-cyan-glow/10' },
  { type: 'condition' as const, label: 'Circuit Breaker OK', icon: ShieldCheck, color: 'text-cyan-glow', bg: 'bg-cyan-glow/10' },
  { type: 'condition' as const, label: 'Gas Below Threshold', icon: ShieldCheck, color: 'text-cyan-glow', bg: 'bg-cyan-glow/10' },
  { type: 'action' as const, label: 'Swap X% to Token', icon: Zap, color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
  { type: 'action' as const, label: 'Add Liquidity', icon: Zap, color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
  { type: 'action' as const, label: 'Harvest Rewards', icon: Zap, color: 'text-emerald-glow', bg: 'bg-emerald-glow/10' },
  { type: 'guard' as const, label: 'Max Slippage Guard', icon: ShieldCheck, color: 'text-rose-glow', bg: 'bg-rose-glow/10' },
  { type: 'guard' as const, label: 'Min Output Guard', icon: ShieldCheck, color: 'text-rose-glow', bg: 'bg-rose-glow/10' },
  { type: 'guard' as const, label: 'Daily Limit Check', icon: ShieldCheck, color: 'text-rose-glow', bg: 'bg-rose-glow/10' },
]

const TYPE_COLORS = {
  trigger: { border: 'border-amber-glow/30', bg: 'bg-amber-glow/5', text: 'text-amber-glow' },
  condition: { border: 'border-cyan-glow/30', bg: 'bg-cyan-glow/5', text: 'text-cyan-glow' },
  action: { border: 'border-emerald-glow/30', bg: 'bg-emerald-glow/5', text: 'text-emerald-glow' },
  guard: { border: 'border-rose-glow/30', bg: 'bg-rose-glow/5', text: 'text-rose-glow' },
}

export default function StudioPage() {
  const [blocks, setBlocks] = useState<Block[]>([
    { id: '1', type: 'trigger', label: 'Price Deviation > X bps', config: { threshold: '50' } },
    { id: '2', type: 'condition', label: 'Oracle Price Fresh', config: {} },
    { id: '3', type: 'action', label: 'Swap X% to Token', config: { percent: '20', token: 'BUSD' } },
    { id: '4', type: 'guard', label: 'Max Slippage Guard', config: { maxBps: '300' } },
  ])
  const [showPreview, setShowPreview] = useState(false)
  const { mutate: trigger, isPending } = useTriggerTask()
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true)
    setAiError(null)

    try {
      const res = await fetch('/api/ai/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const json = await res.json()
      if (json.blocks) {
        setBlocks(json.blocks)
        setAiPrompt('')
      } else {
        setAiError(json.error || 'Failed to generate strategy')
      }
    } catch {
      setAiError('AI service unavailable')
    } finally {
      setAiLoading(false)
    }
  }, [aiPrompt, aiLoading])

  const addBlock = useCallback((palette: typeof PALETTE[0]) => {
    setBlocks((prev) => [...prev, { id: Date.now().toString(), type: palette.type, label: palette.label, config: {} }])
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const intentJson = {
    strategy: 'custom-blueprint',
    pipeline: blocks.map((b) => ({ type: b.type, label: b.label, config: b.config })),
    generatedAt: new Date().toISOString(),
    signingModule: 'EquiliBotModule',
  }

  return (
    <>
      <Topbar title="Strategy Studio" />
      <PageWrapper>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Block Palette */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-arctic mb-3 flex items-center gap-2">
              <Blocks className="w-4 h-4 text-gold-500" /> Block Palette
            </h3>
            <div className="space-y-1.5">
              {PALETTE.map((p, i) => (
                <button
                  key={i}
                  onClick={() => addBlock(p)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all',
                    'hover:bg-glass-hover border border-transparent hover:border-glass-border'
                  )}
                  id={`palette-${p.type}-${i}`}
                >
                  <Plus className="w-3 h-3 text-mist" />
                  <p.icon className={cn('w-3.5 h-3.5', p.color)} />
                  <span className="text-mist">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="lg:col-span-2 glass-panel p-5">
            <h3 className="text-sm font-semibold text-arctic mb-4">Strategy Blueprint</h3>

            {/* AI Strategy Builder */}
            <div className="mb-4 p-3 rounded-xl bg-gold-500/5 border border-gold-500/15">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-gold-400" />
                <span className="text-xs font-semibold text-gold-400">AI Strategy Builder</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
                  placeholder="Describe your strategy in plain English…"
                  className="flex-1 bg-space-800 border border-glass-border rounded-lg px-3 py-2 text-xs text-arctic outline-none placeholder:text-mist/40 focus:border-gold-500/40 transition-colors"
                  id="ai-strategy-input"
                  disabled={aiLoading}
                />
                <button
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-xs font-semibold hover:from-gold-400 hover:to-gold-500 transition-all disabled:opacity-40"
                  id="ai-generate-btn"
                >
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiLoading ? 'Generating…' : 'Generate'}
                </button>
              </div>
              {aiError && (
                <p className="text-[10px] text-rose-glow mt-1.5">{aiError}</p>
              )}
            </div>
            <div className="space-y-2 min-h-[400px]">
              {blocks.map((block, i) => {
                const colors = TYPE_COLORS[block.type]
                return (
                  <div key={block.id}>
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border', colors.border, colors.bg)}
                    >
                      <span className={cn('text-[10px] font-bold uppercase', colors.text)}>{block.type}</span>
                      <span className="text-xs text-arctic flex-1">{block.label}</span>
                      {Object.entries(block.config).map(([k, v]) => (
                        <span key={k} className="text-[10px] text-mist font-mono bg-space-800 px-1.5 py-0.5 rounded">
                          {k}={v}
                        </span>
                      ))}
                      <button onClick={() => removeBlock(block.id)} className="text-mist hover:text-rose-glow transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                    {i < blocks.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="w-4 h-4 text-mist/30" />
                      </div>
                    )}
                  </div>
                )
              })}
              {blocks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[300px] text-mist text-sm">
                  <Blocks className="w-10 h-10 mb-3 text-mist/20" />
                  <p>Add blocks from the palette to build your strategy</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-glass-border">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-space-700 text-sm text-mist hover:text-arctic transition-colors"
                id="preview-intent"
              >
                <Code className="w-3.5 h-3.5" />
                {showPreview ? 'Hide' : 'Preview'} Intent
                <ChevronDown className={cn('w-3 h-3 transition-transform', showPreview && 'rotate-180')} />
              </button>
              <button
                onClick={() => trigger('delta-neutral-rebalance')}
                disabled={isPending || blocks.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-space-950 text-sm font-semibold hover:from-gold-400 hover:to-gold-500 transition-all disabled:opacity-40 ml-auto"
                id="deploy-strategy"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Deploy Strategy
              </button>
            </div>
          </div>

          {/* Intent Preview */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-arctic mb-3 flex items-center gap-2">
              <Code className="w-4 h-4 text-gold-500" /> Cryptographic Intent
            </h3>
            <pre className="text-[10px] text-mist/70 font-mono bg-space-950 rounded-lg p-3 overflow-x-auto h-[calc(100%-2.5rem)]">
              {JSON.stringify(intentJson, null, 2)}
            </pre>
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
