/**
 * EquiliBot — React Query hooks for telemetry data
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAgentStatus,
  fetchAgentMetrics,
  fetchAuditEntries,
  fetchPolicy,
  fetchTaskStatuses,
  fetchTaskLatestProof,
  triggerTask,
} from '@/lib/api/telemetry'
import type { AutonomousTaskId } from '@/lib/api/types'

export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: fetchAgentStatus,
    refetchInterval: 5_000,
    retry: 2,
  })
}

export function useAgentMetrics() {
  return useQuery({
    queryKey: ['agent-metrics'],
    queryFn: fetchAgentMetrics,
    refetchInterval: 10_000,
    retry: 2,
  })
}

export function useAuditLog(date?: string) {
  return useQuery({
    queryKey: ['audit-log', date],
    queryFn: () => fetchAuditEntries(date, 200),
    refetchInterval: 15_000,
    retry: 1,
  })
}

export function usePolicy() {
  return useQuery({
    queryKey: ['policy'],
    queryFn: fetchPolicy,
    refetchInterval: 30_000,
    retry: 2,
  })
}

export function useTaskStatuses() {
  return useQuery({
    queryKey: ['task-statuses'],
    queryFn: fetchTaskStatuses,
    refetchInterval: 10_000,
    retry: 2,
  })
}

export function useTaskProof(taskId?: AutonomousTaskId) {
  return useQuery({
    queryKey: ['task-proof', taskId],
    queryFn: () => fetchTaskLatestProof(taskId),
    refetchInterval: 10_000,
    retry: 1,
  })
}

export function useTriggerTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: AutonomousTaskId) => triggerTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['task-proof'] })
      queryClient.invalidateQueries({ queryKey: ['audit-log'] })
    },
  })
}
