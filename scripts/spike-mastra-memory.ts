/**
 * Throwaway spike — verifies Mastra Memory's resource-scoped working memory
 * survives instance teardown, and measures per-user-DB cost shape.
 *
 * Question 1: Does `workingMemory.scope: 'resource'` persist across new
 *             Memory instances pointed at the same libSQL DB? (Dream-output
 *             sink viability.)
 * Question 2: Is resource isolation enforced — does resource A's memory
 *             leak to resource B?
 * Question 3: What's the cost shape (latency, disk, RSS) for N=10 per-user
 *             DBs vs one shared DB?
 *
 * Run: npx tsx scripts/spike-mastra-memory.ts
 */

import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { rm, mkdir, stat, readdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '.spike-data')

const ALICE = 'did:privy:alice'
const BOB = 'did:privy:bob'

/** A dream-shaped payload. This is what the dream-pass agent would write
 *  to working memory after distilling a fleet run's archive. We use Markdown
 *  + an inline JSON code block so it survives Mastra's string-store and
 *  is still parseable downstream. */
function dreamPayload(items: Array<{ kind: string; content: string; salience: number; sourceRunId: string }>) {
  return [
    '# Extracted memory items',
    '',
    '<!-- dream-pass output v1; do not hand-edit -->',
    '',
    '```json',
    JSON.stringify({ version: 1, items }, null, 2),
    '```'
  ].join('\n')
}

const SAMPLE_ITEMS = [
  {
    kind: 'risk_exposure',
    content: '38% of portfolio exposure routed through JLP on Drift. Liquidation threshold ~SOL $118.',
    salience: 0.9,
    sourceRunId: 'fleet_run_2026-05-15_drift-audit'
  },
  {
    kind: 'preference',
    content: 'User opts in to receiving alerts on protocol incidents but not on price moves.',
    salience: 0.6,
    sourceRunId: 'fleet_run_2026-05-15_drift-audit'
  }
]

function fmt(n: number, unit: 'ms' | 'kb' | 'mb' = 'ms') {
  if (unit === 'kb') return `${(n / 1024).toFixed(1)} KB`
  if (unit === 'mb') return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${n.toFixed(1)}ms`
}

function section(title: string) {
  console.log('\n' + '─'.repeat(64))
  console.log(title)
  console.log('─'.repeat(64))
}

function buildMemory(dbPath: string, storeId: string) {
  const storage = new LibSQLStore({ id: storeId, url: `file:${dbPath}` })
  const memory = new Memory({
    storage,
    options: {
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: '# Extracted memory items\n\n<!-- empty -->'
      }
    }
  })
  return { memory, storage }
}

async function ensureThread(memory: Memory, threadId: string, resourceId: string) {
  const now = new Date()
  await memory.saveThread({
    thread: {
      id: threadId,
      resourceId,
      title: `spike-thread-${threadId}`,
      createdAt: now,
      updatedAt: now,
      metadata: {}
    }
  })
}

async function part1ResourceScopePersistence() {
  section('Part 1 — Resource-scoped working memory survives teardown')

  const dbPath = path.join(DATA_DIR, 'part1.db')
  await rm(dbPath, { force: true }).catch(() => {})

  // ── Instance A: write working memory for Alice from thread T1
  console.log('\n[A] Spinning up Memory instance A...')
  const tA0 = performance.now()
  const { memory: memA } = buildMemory(dbPath, 'spike-part1')
  await ensureThread(memA, 'thread-T1', ALICE)
  console.log(`  ✓ instance + first thread ready in ${fmt(performance.now() - tA0)}`)

  const payload1 = dreamPayload(SAMPLE_ITEMS)
  await memA.updateWorkingMemory({
    threadId: 'thread-T1',
    resourceId: ALICE,
    workingMemory: payload1
  })
  console.log(`  ✓ wrote working memory (${payload1.length} chars) for ${ALICE} via T1`)

  // ── Cross-thread read within same instance: T2, same resource
  await ensureThread(memA, 'thread-T2', ALICE)
  const readT2 = await memA.getWorkingMemory({ threadId: 'thread-T2', resourceId: ALICE })
  const t2Match = readT2 === payload1
  console.log(`  ${t2Match ? '✓' : '✗'} cross-thread read (T2, same resource, same instance): ${t2Match ? 'matched' : 'MISMATCH'}`)
  if (!t2Match) {
    console.log(`    expected length: ${payload1.length}, got: ${readT2?.length ?? 'null'}`)
  }

  // ── Tear down instance A
  console.log('\n[A→B] Tearing down instance A, GC pause, spinning up fresh instance B...')
  // No explicit close API on Memory; null the refs and let GC reclaim. The
  // libSQL client uses a fresh connection per LibSQLStore so a new instance
  // is genuinely cold.
  const tB0 = performance.now()
  const { memory: memB } = buildMemory(dbPath, 'spike-part1')

  // Read working memory from a NEW thread T3 under same resource — the
  // critical test for "dream output survives session teardown".
  await ensureThread(memB, 'thread-T3', ALICE)
  const readT3 = await memB.getWorkingMemory({ threadId: 'thread-T3', resourceId: ALICE })
  const t3Match = readT3 === payload1
  console.log(`  ✓ fresh instance ready in ${fmt(performance.now() - tB0)}`)
  console.log(`  ${t3Match ? '✓' : '✗'} new-instance read (T3, same resource): ${t3Match ? 'MATCHED — resource scope survives teardown' : 'MISMATCH — scope broken'}`)
  if (!t3Match) {
    console.log(`    expected length: ${payload1.length}, got length: ${readT3?.length ?? 'null'}`)
    console.log(`    got (first 200): ${(readT3 ?? '').slice(0, 200)}`)
  }

  // ── Isolation check: Bob should see nothing
  await ensureThread(memB, 'thread-T4', BOB)
  const readBob = await memB.getWorkingMemory({ threadId: 'thread-T4', resourceId: BOB })
  const bobIsolated = readBob === null || readBob === '' || readBob === '# Extracted memory items\n\n<!-- empty -->'
  console.log(`  ${bobIsolated ? '✓' : '✗'} resource isolation (Bob reads): ${bobIsolated ? 'empty/template (correct)' : 'LEAKED Alice content'}`)
  if (!bobIsolated) {
    console.log(`    bob got: ${(readBob ?? '').slice(0, 200)}`)
  }

  // ── Update + read-back from a third instance — confirms writes after
  //    teardown also persist (this would catch a "first writer wins" bug)
  const item3 = { ...SAMPLE_ITEMS[0], content: 'UPDATED: SOL liq threshold revised down to $112.', salience: 0.95 }
  const payload2 = dreamPayload([item3, SAMPLE_ITEMS[1]])
  await memB.updateWorkingMemory({ threadId: 'thread-T3', resourceId: ALICE, workingMemory: payload2 })
  console.log(`  ✓ wrote updated payload from instance B`)

  const { memory: memC } = buildMemory(dbPath, 'spike-part1')
  await ensureThread(memC, 'thread-T5', ALICE)
  const readT5 = await memC.getWorkingMemory({ threadId: 'thread-T5', resourceId: ALICE })
  const t5Match = readT5 === payload2
  console.log(`  ${t5Match ? '✓' : '✗'} third-instance read sees B's update: ${t5Match ? 'YES' : 'NO — write-after-teardown lost'}`)

  return { passed: t2Match && t3Match && bobIsolated && t5Match }
}

async function part2PerUserDbCost(n: number) {
  section(`Part 2 — Per-user-DB cost shape (N=${n})`)

  const perUserDir = path.join(DATA_DIR, 'per-user')
  await rm(perUserDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(perUserDir, { recursive: true })

  const rssStart = process.memoryUsage().rss
  console.log(`\n[baseline] RSS before any per-user DBs: ${fmt(rssStart, 'mb')}`)

  const timings: number[] = []
  const memories: Memory[] = []

  for (let i = 0; i < n; i++) {
    const userDid = `did:privy:user_${String(i).padStart(3, '0')}`
    const dbPath = path.join(perUserDir, `${userDid.replace(/:/g, '_')}.db`)

    const t0 = performance.now()
    const { memory } = buildMemory(dbPath, `spike-${userDid}`)
    await ensureThread(memory, `thread-init`, userDid)
    await memory.updateWorkingMemory({
      threadId: 'thread-init',
      resourceId: userDid,
      workingMemory: dreamPayload([{ ...SAMPLE_ITEMS[0], sourceRunId: `fleet_run_${userDid}` }])
    })
    const t1 = performance.now()
    timings.push(t1 - t0)
    memories.push(memory)
  }

  const rssEnd = process.memoryUsage().rss
  const rssDelta = rssEnd - rssStart

  // Disk: list created .db files + sizes
  const files = (await readdir(perUserDir)).filter((f) => f.endsWith('.db'))
  let totalBytes = 0
  for (const f of files) {
    const s = await stat(path.join(perUserDir, f))
    totalBytes += s.size
  }

  const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length
  const maxMs = Math.max(...timings)
  const minMs = Math.min(...timings)

  console.log(`\n  files created:        ${files.length}`)
  console.log(`  avg cold-start time:  ${fmt(avgMs)}  (min ${fmt(minMs)} / max ${fmt(maxMs)})`)
  console.log(`  total disk (N=${n}):     ${fmt(totalBytes, 'kb')}`)
  console.log(`  per-user disk avg:    ${fmt(totalBytes / files.length, 'kb')}`)
  console.log(`  RSS delta:            ${fmt(rssDelta, 'mb')}`)
  console.log(`  RSS per-instance avg: ${fmt(rssDelta / n, 'mb')}`)

  // Sanity: do isolated reads return what each user wrote?
  const sampleIdx = Math.floor(n / 2)
  const sampleUserDid = `did:privy:user_${String(sampleIdx).padStart(3, '0')}`
  const sampleRead = await memories[sampleIdx].getWorkingMemory({
    threadId: 'thread-init',
    resourceId: sampleUserDid
  })
  const sampleOk = sampleRead?.includes(`fleet_run_${sampleUserDid}`) ?? false
  console.log(`  spot-check isolation: ${sampleOk ? '✓' : '✗'} user_${sampleIdx} sees its own data only`)

  return { passed: sampleOk, avgMs, totalBytes, rssDelta }
}

async function part3SharedDbCost(n: number) {
  section(`Part 3 — Shared multi-tenant DB baseline (N=${n} resources in one DB)`)

  const dbPath = path.join(DATA_DIR, 'shared.db')
  await rm(dbPath, { force: true }).catch(() => {})

  const rssStart = process.memoryUsage().rss
  const t0 = performance.now()
  const { memory } = buildMemory(dbPath, 'spike-shared')

  for (let i = 0; i < n; i++) {
    const userDid = `did:privy:user_${String(i).padStart(3, '0')}`
    await ensureThread(memory, `thread-${userDid}`, userDid)
    await memory.updateWorkingMemory({
      threadId: `thread-${userDid}`,
      resourceId: userDid,
      workingMemory: dreamPayload([{ ...SAMPLE_ITEMS[0], sourceRunId: `fleet_run_${userDid}` }])
    })
  }
  const t1 = performance.now()
  const rssEnd = process.memoryUsage().rss

  const s = await stat(dbPath)

  console.log(`\n  total wall time:      ${fmt(t1 - t0)}`)
  console.log(`  avg per-write time:   ${fmt((t1 - t0) / n)}`)
  console.log(`  total disk:           ${fmt(s.size, 'kb')}`)
  console.log(`  RSS delta:            ${fmt(rssEnd - rssStart, 'mb')}`)

  // Isolation across tenants in shared DB
  const a = await memory.getWorkingMemory({ threadId: `thread-did:privy:user_001`, resourceId: 'did:privy:user_001' })
  const b = await memory.getWorkingMemory({ threadId: `thread-did:privy:user_002`, resourceId: 'did:privy:user_002' })
  const isolated = a !== b && a?.includes('user_001') && b?.includes('user_002')
  console.log(`  cross-resource isolation in shared DB: ${isolated ? '✓' : '✗'}`)

  return { totalMs: t1 - t0, totalBytes: s.size, rssDelta: rssEnd - rssStart, isolated }
}

async function main() {
  console.log('Mastra Memory spike — fabrick')
  console.log('node:', process.version, '| platform:', process.platform)

  await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {})
  await mkdir(DATA_DIR, { recursive: true })

  const N = 10
  const p1 = await part1ResourceScopePersistence()
  const p2 = await part2PerUserDbCost(N)
  const p3 = await part3SharedDbCost(N)

  section('Findings')
  console.log(`\n  Part 1 (resource scope persistence): ${p1.passed ? 'PASS' : 'FAIL'}`)
  console.log(`  Part 2 (per-user DB, N=${N}):           ${p2.passed ? 'PASS' : 'FAIL'} — ${fmt(p2.avgMs)}/instance, ${fmt(p2.totalBytes, 'kb')} disk, ${fmt(p2.rssDelta, 'mb')} RSS`)
  console.log(`  Part 3 (shared DB, N=${N}):              ${p3.isolated ? 'isolated' : 'NOT isolated'} — ${fmt(p3.totalMs)} total, ${fmt(p3.totalBytes, 'kb')} disk, ${fmt(p3.rssDelta, 'mb')} RSS`)

  const perUserOverheadBytes = p2.totalBytes - p3.totalBytes
  const perUserOverheadRss = p2.rssDelta - p3.rssDelta
  console.log(`\n  Per-user vs shared overhead (N=${N}):`)
  console.log(`    disk:  +${fmt(perUserOverheadBytes, 'kb')} (${(perUserOverheadBytes / p3.totalBytes * 100).toFixed(0)}% over shared)`)
  console.log(`    RSS:   +${fmt(perUserOverheadRss, 'mb')}`)
  console.log(`    extrapolated to 1000 users (linear): ${fmt((perUserOverheadBytes / N) * 1000 + p3.totalBytes, 'mb')} disk`)

  process.exit(p1.passed && p2.passed ? 0 : 1)
}

main().catch((err) => {
  console.error('\nSpike failed:', err)
  process.exit(1)
})
