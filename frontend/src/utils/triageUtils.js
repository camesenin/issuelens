export function hasUnitTestsInIssue(issue) {
  if (typeof issue?.triage_report?.has_unit_tests === 'boolean') {
    return issue.triage_report.has_unit_tests
  }
  const diffSource = `${issue?.diff || ''}\n${issue?.body || ''}`
  return /(?:test_[\w.-]+\.py|[\w.-]+_test\.py|[\w.-]+_test\.rs|\/test\/|[\w.-]+\.(?:test|spec)\.(?:tsx|ts|jsx|js)|\/__tests__\/|\/tests?\/)/i.test(
    diffSource
  )
}

export function getComplexityTierInfo(issue) {
  const rawXlm =
    Number(issue?.bounty_xlm) ||
    Number(issue?.triage_report?.bounty_xlm) ||
    Number(issue?.complexity_pts) ||
    0

  if (
    rawXlm >= 180 ||
    issue?.triage_report?.complexity === 'High' ||
    issue?.triage_report?.is_breaking
  ) {
    return { pts: 200, xlm: 200, label: '200 pts', tierName: 'Tier III · Critical' }
  }
  if (
    rawXlm > 0 &&
    rawXlm <= 110 &&
    (issue?.triage_report?.complexity === 'Low' ||
      issue?.triage_report?.suggested_tags?.includes('good-first-issue') ||
      rawXlm === 100 ||
      rawXlm === 25)
  ) {
    return { pts: 100, xlm: 100, label: '100 pts', tierName: 'Tier I · Standard' }
  }
  return { pts: 150, xlm: 150, label: '150 pts', tierName: 'Tier II · Complex' }
}

export function getIssueStatusBadges(issue) {
  const report = issue?.triage_report
  const tags = report?.suggested_tags || []
  const needsRepro = Boolean(
    report?.needs_repro || tags.includes('needs-repro') || tags.includes('repro-needed')
  )
  const hasTests = hasUnitTestsInIssue(issue)
  const missingTests = Boolean(
    tags.includes('missing-tests') || (issue?.is_pr && !hasTests && !tags.includes('ready'))
  )
  const isBreaking = Boolean(
    report?.is_breaking ||
      tags.includes('breaking-change') ||
      tags.includes('breaking-api')
  )
  const isReady = Boolean(!needsRepro && !missingTests && !isBreaking)

  const badges = []
  if (needsRepro) {
    badges.push({
      id: 'needs-repro',
      label: 'needs-repro',
      className: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    })
  }
  if (missingTests) {
    badges.push({
      id: 'missing-tests',
      label: 'missing-tests',
      className: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
    })
  }
  if (isBreaking) {
    badges.push({
      id: 'breaking-change',
      label: 'breaking-change',
      className: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
    })
  }
  if (isReady || tags.includes('ready')) {
    badges.push({
      id: 'ready',
      label: 'ready',
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    })
  }

  // Include one extra contextual domain tag if available
  const extraTags = tags.filter(
    (t) =>
      ![
        'needs-repro',
        'repro-needed',
        'missing-tests',
        'breaking-change',
        'breaking-api',
        'ready',
      ].includes(t)
  )
  if (extraTags.length > 0 && badges.length < 3) {
    badges.push({
      id: extraTags[0],
      label: extraTags[0],
      className: 'bg-zinc-800/80 text-zinc-300 border-white/[0.08]',
    })
  }

  return {
    badges,
    needsRepro,
    missingTests,
    isBreaking,
    hasTests,
    isReady: isReady || tags.includes('ready'),
  }
}

export function getReadinessScore(issue) {
  if (typeof issue?.readiness_score === 'number') {
    return issue.readiness_score
  }
  const { needsRepro, missingTests, isReady } = getIssueStatusBadges(issue)
  if (issue?.bounty_status === 'paid') return 98
  if (isReady) return 94
  let score = 85
  if (needsRepro) score -= 42
  if (missingTests) score -= 22
  if (issue?.triage_report?.is_breaking) score -= 12
  return Math.max(18, Math.min(99, score))
}

export function getRepoSlug(issue, fallback = 'stellar/stellar-soroban-env') {
  if (issue?.repository?.owner && issue?.repository?.name) {
    return `${issue.repository.owner}/${issue.repository.name}`
  }
  return fallback
}

export function truncateStellarAddress(addr) {
  if (!addr || addr.length < 12) return addr || ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function truncateTxHash(hash) {
  if (!hash || hash.length < 18) return hash || ''
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function buildDeterministicTxHash(issueId, address, amount) {
  const seed = `${issueId}-${address}-${amount}-${Date.now()}`
  let hex = ''
  for (let i = 0; i < 64; i += 1) {
    const code = seed.charCodeAt(i % seed.length) + i * 17
    hex += (code % 16).toString(16)
  }
  return hex
}
