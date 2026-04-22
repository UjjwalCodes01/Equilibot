'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Zap,
  Shield,
  PieChart,
  FileSearch,
  Fingerprint,
  Sprout,
  Blocks,
  Map,
  Layers,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Demo', icon: Sparkles, description: 'Judge Onboarding' },
  { href: '/nexus', label: 'The Nexus', icon: Zap, description: 'Command Center' },
  { href: '/safety', label: 'Safety', icon: Shield, description: 'Guardrails' },
  { href: '/portfolio', label: 'Portfolio', icon: PieChart, description: 'Active Management' },
  { href: '/audits', label: 'Audits', icon: FileSearch, description: 'Governance' },
  { href: '/identity', label: 'Identity', icon: Fingerprint, description: 'BAP-578 Passport' },
  { href: '/yield', label: 'Yield', icon: Sprout, description: 'Reward Harvesting' },
  { href: '/studio', label: 'Studio', icon: Blocks, description: 'Strategy Builder' },
  { href: '/arbitrage', label: 'Arbitrage', icon: Map, description: 'DEX Optimization' },
  { href: '/lifecycle', label: 'Lifecycle', icon: Layers, description: 'Token Manager' },
  { href: '/sandbox', label: 'Sandbox', icon: FlaskConical, description: 'Simulator' },
] as const

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <motion.aside
      className={cn(
        'fixed left-0 top-0 z-50 h-screen flex flex-col',
        'glass-panel border-r border-glass-border',
        'transition-all duration-300 ease-out',
        collapsed ? 'w-[72px]' : 'w-[240px]'
      )}
      style={{ borderRadius: 0, borderLeft: 'none', borderTop: 'none', borderBottom: 'none' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-glass-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-space-950" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="overflow-hidden"
          >
            <h1 className="text-sm font-bold gold-gradient tracking-tight">EquiliBot</h1>
            <p className="text-[10px] text-mist leading-none">Treasury Executive</p>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`nav-${item.href.replace('/', '') || 'demo'}`}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group relative',
                isActive
                  ? 'bg-gold-500/10 text-gold-400 gold-border'
                  : 'text-mist hover:text-arctic hover:bg-glass-hover'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gold-500"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className={cn('w-4.5 h-4.5 shrink-0', isActive ? 'text-gold-400' : 'text-mist group-hover:text-arctic')} />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-2 pb-3 border-t border-glass-border pt-3">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-2 rounded-xl text-mist hover:text-arctic hover:bg-glass-hover transition-colors"
          id="sidebar-toggle"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
