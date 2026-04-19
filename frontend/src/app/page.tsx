'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { ThoughtLog } from '@/components/nexus/thought-log'
import { KpiRow } from '@/components/nexus/kpi-row'
import { TaskCards } from '@/components/nexus/task-cards'
import { CommandInput } from '@/components/nexus/command-input'
import { TopologyChart } from '@/components/nexus/topology-chart'

export default function NexusPage() {
  return (
    <>
      <Topbar title="The Nexus" />
      <PageWrapper>
        {/* KPI Row */}
        <KpiRow />

        {/* Main Split Panel */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mt-5">
          {/* Left: Agent Thought Log */}
          <div className="xl:col-span-2 flex flex-col gap-4">
            <div className="glass-panel flex-1 flex flex-col overflow-hidden" style={{ minHeight: '520px' }}>
              <div className="px-5 py-3.5 border-b border-glass-border flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-glow status-pulse" />
                <h3 className="text-sm font-semibold text-arctic">Agent Thought Stream</h3>
              </div>
              <ThoughtLog />
              <CommandInput />
            </div>
          </div>

          {/* Right: Dashboard */}
          <div className="xl:col-span-3 flex flex-col gap-5">
            {/* Pipeline Activity Chart */}
            <div className="glass-panel p-5">
              <h3 className="text-sm font-semibold text-arctic mb-4">Pipeline Activity</h3>
              <TopologyChart />
            </div>

            {/* Autonomous Task Status */}
            <TaskCards />
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
