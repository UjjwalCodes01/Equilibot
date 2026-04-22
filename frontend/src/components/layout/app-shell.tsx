'use client'

import { Sidebar } from './sidebar'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen transition-all duration-300 ease-out',
          collapsed ? 'ml-[72px]' : 'ml-[240px]'
        )}
      >
        {children}
      </div>
    </div>
  )
}
