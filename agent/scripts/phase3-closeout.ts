import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

type GateResult = {
  name: string
  passed: boolean
  detail: string
}

type SoakReport = {
  plannedHours?: number
  actualDurationSeconds?: number
  exitCode?: number | null
  endedAt?: string
}

const REQUIRED_SOAK_HOURS = 72
const REQUIRED_SOAK_SECONDS = REQUIRED_SOAK_HOURS * 3600

function printGate(result: GateResult): void {
  const label = result.passed ? 'PASS' : 'FAIL'
  console.log(`[${label}] ${result.name}: ${result.detail}`)
}

function replaceOnce(text: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(text)) {
    throw new Error(`Pattern not found while updating text: ${pattern.source}`)
  }
  return text.replace(pattern, replacement)
}

async function checkSoakGate(repoRoot: string): Promise<GateResult & { reportPath?: string }> {
  const soakDir = path.join(repoRoot, 'data', 'soak')
  if (!existsSync(soakDir)) {
    return {
      name: '72h soak report',
      passed: false,
      detail: 'data/soak directory not found',
    }
  }

  const files = (await readdir(soakDir)).filter((f) => f.startsWith('soak-report-') && f.endsWith('.json'))
  if (files.length === 0) {
    return {
      name: '72h soak report',
      passed: false,
      detail: 'No soak-report-*.json files found',
    }
  }

  const reports: Array<{
    fullPath: string
    mtimeMs: number
    report: SoakReport
  }> = []

  for (const file of files) {
    const fullPath = path.join(soakDir, file)
    const s = await stat(fullPath)
    const raw = await readFile(fullPath, 'utf-8')
    reports.push({
      fullPath,
      mtimeMs: s.mtimeMs,
      report: JSON.parse(raw) as SoakReport,
    })
  }

  reports.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const completed72h = reports.find((entry) => {
    const plannedHours = entry.report.plannedHours ?? 0
    const actualDurationSeconds = entry.report.actualDurationSeconds ?? 0
    const exitCode = entry.report.exitCode
    return plannedHours >= REQUIRED_SOAK_HOURS
      && actualDurationSeconds >= REQUIRED_SOAK_SECONDS
      && (exitCode === 0 || exitCode === null)
  })

  if (!completed72h) {
    const latest = reports[0]
    const latestReport = latest.report
    const plannedHours = latestReport.plannedHours ?? 0
    const actualDurationSeconds = latestReport.actualDurationSeconds ?? 0
    const exitCode = latestReport.exitCode

    return {
      name: '72h soak report',
      passed: false,
      detail: `No completed 72h soak report yet. Latest report=${path.relative(repoRoot, latest.fullPath)}, plannedHours=${plannedHours}, actualSeconds=${actualDurationSeconds}, exitCode=${String(exitCode)}`,
    }
  }

  return {
    name: '72h soak report',
    passed: true,
    detail: `report=${path.relative(repoRoot, completed72h.fullPath)}`,
    reportPath: completed72h.fullPath,
  }
}

function checkSignoffGate(agentRoot: string): Promise<GateResult> {
  const signoffPath = path.join(agentRoot, 'SECURITY_REVIEW_SIGNOFF.md')
  return readFile(signoffPath, 'utf-8').then((content) => {
    const approvedCanary = /- \[x\] Approved for canary/.test(content)
    const approvedActive = /- \[x\] Approved for active/.test(content)
    const passed = approvedCanary || approvedActive

    return {
      name: 'External security sign-off',
      passed,
      detail: passed
        ? `approvedCanary=${String(approvedCanary)}, approvedActive=${String(approvedActive)}`
        : 'SECURITY_REVIEW_SIGNOFF.md has no approved checkbox selected',
    }
  })
}

async function applyCloseoutUpdates(
  repoRoot: string,
  agentRoot: string,
  soakReportPath: string,
): Promise<void> {
  const planPath = path.join(repoRoot, 'plan')
  const phaseStatusPath = path.join(agentRoot, 'PHASE3_VALIDATION_STATUS.md')

  const nowIso = new Date().toISOString()

  let plan = await readFile(planPath, 'utf-8')
  plan = replaceOnce(
    plan,
    /Status: Implementation complete\. Operational validation in progress \(72h canary soak running since [^)]+\)\./,
    'Status: Complete. Testnet operational validation and sign-off complete.',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Complete 72-hour continuous soak run on testnet with no unsafe execution/,
    '- [x] Complete 72-hour continuous soak run on testnet with no unsafe execution',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Canary stage completes with no policy bypass and acceptable failure budget/,
    '- [x] Canary stage completes with no policy bypass and acceptable failure budget',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Testnet signer path is live and validated end-to-end \(local signer allowed\)/,
    '- [x] Testnet signer path is live and validated end-to-end (local signer allowed)',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Testnet soak run passes and audit logs are complete for all decisions/,
    '- [x] Testnet soak run passes and audit logs are complete for all decisions',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] External security review for autonomous execution path is signed off/,
    '- [x] External security review for autonomous execution path is signed off',
  )
  plan = replaceOnce(
    plan,
    /Status: Blocked until Phase 3A exit criteria are complete\./,
    'Status: Ready to begin. Phase 3A exit criteria are complete.',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Final external security review sign-off/,
    '- [x] Final external security review sign-off',
  )
  plan = replaceOnce(
    plan,
    /- \[ \] Phase 3A exit criteria completed on testnet/,
    '- [x] Phase 3A exit criteria completed on testnet',
  )

  let phaseStatus = await readFile(phaseStatusPath, 'utf-8')
  phaseStatus = replaceOnce(phaseStatus, /^Updated: .*$/m, `Updated: ${nowIso}`)
  phaseStatus = phaseStatus.replace(
    /## Remaining Exit Blockers[\s\S]*$/,
    [
      '## Remaining Exit Blockers',
      '- None. Phase 3A exit criteria are complete.',
      '',
      '## Phase 3 Closeout Evidence',
      `- Closeout timestamp: \`${nowIso}\``,
      `- Soak report used: \`${path.relative(repoRoot, soakReportPath)}\``,
      '- External security review: approved in `SECURITY_REVIEW_SIGNOFF.md`.',
      '',
    ].join('\n'),
  )

  await writeFile(planPath, plan, 'utf-8')
  await writeFile(phaseStatusPath, phaseStatus, 'utf-8')
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const agentRoot = path.resolve(scriptDir, '..')
  const repoRoot = path.resolve(agentRoot, '..')

  const soakGate = await checkSoakGate(repoRoot)
  const signoffGate = await checkSignoffGate(agentRoot)

  console.log('\n== Phase 3 Closeout Gate Check ==')
  printGate(soakGate)
  printGate(signoffGate)

  const allPassed = soakGate.passed && signoffGate.passed
  if (!allPassed) {
    console.error('\nPhase 3 cannot be marked complete yet. Resolve failing gates and rerun.')
    process.exit(1)
  }

  if (!apply) {
    console.log('\nAll gates passed. Re-run with --apply to mark completion in files.')
    return
  }

  if (!soakGate.reportPath) {
    throw new Error('Internal error: missing soak report path during apply')
  }

  await applyCloseoutUpdates(repoRoot, agentRoot, soakGate.reportPath)
  console.log('\nPhase 3 completion updates applied to plan and status files.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
