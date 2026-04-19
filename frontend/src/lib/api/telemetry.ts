/**
 * EquiliBot — Telemetry API Client
 *
 * All calls go through the Next.js API proxy (/api/agent/...)
 * so the Bearer token stays server-side.
 */

import type {
  AgentStatusResponse,
  AgentMetricsResponse,
  AuditResponse,
  PolicyResponse,
  TaskStatusResponse,
  TaskProofResponse,
  TaskRunResponse,
  AutonomousTaskId,
} from './types'

const BASE = '/api/agent'

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new Error(`Telemetry API error ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export function fetchAgentStatus(): Promise<AgentStatusResponse> {
  return fetchJson<AgentStatusResponse>('/status')
}

export function fetchAgentMetrics(): Promise<AgentMetricsResponse> {
  return fetchJson<AgentMetricsResponse>('/metrics')
}

export function fetchAuditEntries(
  date?: string,
  limit = 100,
  offset = 0
): Promise<AuditResponse> {
  const d = date ?? new Date().toISOString().split('T')[0]
  return fetchJson<AuditResponse>(`/audit?date=${d}&limit=${limit}&offset=${offset}`)
}

export function fetchPolicy(): Promise<PolicyResponse> {
  return fetchJson<PolicyResponse>('/policy')
}

export function fetchTaskStatuses(): Promise<TaskStatusResponse> {
  return fetchJson<TaskStatusResponse>('/tasks/status')
}

export function fetchTaskLatestProof(taskId?: AutonomousTaskId): Promise<TaskProofResponse> {
  const query = taskId ? `?taskId=${taskId}` : ''
  return fetchJson<TaskProofResponse>(`/tasks/latest${query}`)
}

export function triggerTask(taskId: AutonomousTaskId): Promise<TaskRunResponse> {
  return fetchJson<TaskRunResponse>('/tasks/run', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  })
}

export function fetchHealth(): Promise<{ status: string; uptime: number }> {
  return fetch('/api/agent/health').then((r) => r.json())
}
