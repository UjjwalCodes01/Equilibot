'use client'

import { Topbar } from '@/components/layout/topbar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { ModuleStatus } from '@/components/safety/module-status'
import { GuardStatus } from '@/components/safety/guard-status'
import { ExecutionLadder } from '@/components/safety/execution-ladder'
import { CircuitBreakerPanel } from '@/components/safety/circuit-breaker'
import { PolicyPanel } from '@/components/safety/policy-panel'

export default function SafetyPage() {
  return (
    <>
      <Topbar title="Safety & Guardrails" />
      <PageWrapper>
        {/* Execution Mode Ladder */}
        <ExecutionLadder />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          {/* Module Status */}
          <ModuleStatus />
          {/* Guard Status */}
          <GuardStatus />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
          {/* Circuit Breaker */}
          <CircuitBreakerPanel />
          {/* Policy Overview */}
          <div className="lg:col-span-2">
            <PolicyPanel />
          </div>
        </div>
      </PageWrapper>
    </>
  )
}
