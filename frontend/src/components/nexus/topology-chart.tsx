'use client'

import { useAgentMetrics } from '@/hooks/use-telemetry'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo, useRef, useEffect, useState } from 'react'

interface DataPoint {
  time: string
  pipelines: number
  opportunities: number
  executions: number
}

export function TopologyChart() {
  const { data: metrics } = useAgentMetrics()
  const historyRef = useRef<DataPoint[]>([])
  const [chartData, setChartData] = useState<DataPoint[]>([])

  // Accumulate data points over time from metrics snapshots
  useEffect(() => {
    if (!metrics) return
    const now = new Date()
    const point: DataPoint = {
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      pipelines: metrics.pipelineRuns,
      opportunities: metrics.opportunitiesDetected,
      executions: metrics.executionsSucceeded,
    }
    historyRef.current = [...historyRef.current.slice(-29), point]
    setChartData([...historyRef.current])
  }, [metrics])

  const displayData = useMemo(() => {
    if (chartData.length > 0) return chartData
    // Show placeholder shape when no data
    return Array.from({ length: 20 }, (_, i) => ({
      time: `${i}`,
      pipelines: i % 5,
      opportunities: i % 3,
      executions: i % 2,
    }))
  }, [chartData])

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradOpp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradExec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'rgba(17,24,39,0.9)',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 12,
              fontSize: 12,
              color: '#f8fafc',
            }}
          />
          <Area type="monotone" dataKey="pipelines" stroke="#818cf8" fill="url(#gradPipeline)" strokeWidth={2} />
          <Area type="monotone" dataKey="opportunities" stroke="#f59e0b" fill="url(#gradOpp)" strokeWidth={2} />
          <Area type="monotone" dataKey="executions" stroke="#10b981" fill="url(#gradExec)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
