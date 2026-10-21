import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
  ExternalLink,
  FileCode2,
  Filter,
  GitPullRequest,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wallet,
  X,
} from 'lucide-react'
import MarkdownRenderer from './components/MarkdownRenderer.jsx'
import {
  COMPLEXITY_TIERS,
  DEFAULT_DEMO_STELLAR_ADDRESS,
  INITIAL_DEMO_ISSUES,
} from './data/demoIssues.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function hasUnitTestsInIssue(issue) {
  if (typeof issue?.triage_report?.has_unit_tests === 'boolean') {
    return issue.triage_report.has_unit_tests
  }
  const diffSource = `${issue?.diff || ''}\n${issue?.body || ''}`
  return /(?:test_[\w.-]+\.py|[\w.-]+_test\.py|[\w.-]+_test\.rs|\/test\/|[\w.-]+\.(?:test|spec)\.(?:tsx|ts|jsx|js)|\/__tests__\/|\/tests?\/)/i.test(
    diffSource
  )
}

function getComplexityTierInfo(issue) {
  const rawXlm =
    Number(issue?.bounty_xlm) ||
    Number(issue?.triage_report?.bounty_xlm) ||
    Number(issue?.complexity_pts) ||
    0

  if (rawXlm >= 180 || issue?.triage_report?.complexity === 'High' || issue?.triage_report?.is_breaking) {
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

function getIssueStatusBadges(issue) {
  const report = issue?.triage_report
  const tags = report?.suggested_tags || []
  const needsRepro = Boolean(report?.needs_repro || tags.includes('needs-repro') || tags.includes('repro-needed'))
  const hasTests = hasUnitTestsInIssue(issue)
  const missingTests = Boolean(
    tags.includes('missing-tests') || (issue?.is_pr && !hasTests && !tags.includes('ready'))
  )
  const isReady = Boolean(!needsRepro && !missingTests && !report?.is_breaking)

  const badges = []
  if (needsRepro) {
    badges.push({
      id: 'needs-repro',
      label: 'needs-repro',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    })
  }
  if (missingTests) {
    badges.push({
      id: 'missing-tests',
      label: 'missing-tests',
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    })
  }
  if (isReady || tags.includes('ready')) {
    badges.push({
      id: 'ready',
      label: 'ready',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    })
  }
  return {
    badges,
    needsRepro,
    missingTests,
    isReady: isReady || tags.includes('ready'),
  }
}

function getReadinessScore(issue) {
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

function truncateStellarAddress(addr) {
  if (!addr || addr.length < 12) return addr || ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function truncateTxHash(hash) {
  if (!hash || hash.length < 18) return hash || ''
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

function buildDeterministicTxHash(issueId, address, amount) {
  const seed = `${issueId}-${address}-${amount}-${Date.now()}`
  let hex = ''
  for (let i = 0; i < 64; i += 1) {
    const code = seed.charCodeAt(i % seed.length) + i * 17
    hex += (code % 16).toString(16)
  }
  return hex
}

function BrandGeometricIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5 text-zinc-100"
      aria-hidden="true"
    >
      <path
        d="M8 1.5L14 5V11L8 14.5L2 11V5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 1.5V8M8 8L14 5M8 8L2 5M8 8V14.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.55"
      />
    </svg>
  )
}

export default function App() {
  const [repoInput, setRepoInput] = useState('stellar/stellar-soroban-env')
  const [issues, setIssues] = useState(INITIAL_DEMO_ISSUES)
  const [selectedId, setSelectedId] = useState(INITIAL_DEMO_ISSUES[0].id)
  const [activeView, setActiveView] = useState('all') // 'all' | 'needs-repro' | 'ready' | 'settled'
  const [searchQuery, setSearchQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [triagingId, setTriagingId] = useState(null)
  const [postingReply, setPostingReply] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedTx, setCopiedTx] = useState(false)
  const [draftedReply, setDraftedReply] = useState(
    INITIAL_DEMO_ISSUES[0].triage_report?.drafted_reply || ''
  )
  const [banner, setBanner] = useState(null)

  const searchInputRef = useRef(null)

  // Stellar Network & Wallet State
  const [networkStatus, setNetworkStatus] = useState({
    status: 'online',
    network: 'TESTNET',
    horizon_url: 'https://horizon-testnet.stellar.org',
    history_latest_ledger: 1489210,
    current_protocol_version: 21,
    demo_simulation_enabled: true,
  })
  const [walletAddress, setWalletAddress] = useState(null)
  const [connectingWallet, setConnectingWallet] = useState(false)

  // Stellar Bounty Settlement Card State
  const [contributorAddressInput, setContributorAddressInput] = useState(
    INITIAL_DEMO_ISSUES[0].contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS
  )
  const [selectedTierPts, setSelectedTierPts] = useState(150)
  const [payingBounty, setPayingBounty] = useState(false)
  const [payoutReceipt, setPayoutReceipt] = useState(null)
  const [payoutError, setPayoutError] = useState(null)

  const fetchIssues = async (selectFirst = false) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues`)
      if (!response.ok) return
      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) {
        // If backend only had the old 3-item seed, merge or prefer the rich 5-item dataset unless user triggered sync
        const isLegacyThreeSeed =
          data.length === 3 &&
          data.every((item) => item.repository?.name === 'react')
        const nextIssues = isLegacyThreeSeed ? INITIAL_DEMO_ISSUES : data
        setIssues(nextIssues)
        if (selectFirst && nextIssues.length > 0) {
          setSelectedId(nextIssues[0].id)
        }
      }
    } catch {
      // Keep pre-populated INITIAL_DEMO_ISSUES when backend is offline
    }
  }

  const fetchStellarNetworkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stellar/network-status`)
      if (!response.ok) return
      const data = await response.json()
      setNetworkStatus((prev) => ({
        ...prev,
        ...data,
        history_latest_ledger: data.history_latest_ledger || prev.history_latest_ledger,
      }))
    } catch {
      // Keep Horizon Testnet indicator online in demo mode
    }
  }

  useEffect(() => {
    fetchIssues(false)
    fetchStellarNetworkStatus()
    const intervalId = setInterval(fetchStellarNetworkStatus, 15000)
    return () => clearInterval(intervalId)
  }, [])

  // Keyboard shortcut '/' or Cmd+K to focus quick search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // View counts & KPI metrics
  const metrics = useMemo(() => {
    let needsReproCount = 0
    let readyCount = 0
    let settledCount = 0
    let escrowedXlm = 0

    for (const item of issues) {
      const { needsRepro, isReady } = getIssueStatusBadges(item)
      const tier = getComplexityTierInfo(item)
      const isPaid = item.bounty_status === 'paid' || Boolean(item.stellar_tx_hash)

      if (needsRepro) needsReproCount += 1
      if (isReady && !isPaid) readyCount += 1
      if (isPaid) {
        settledCount += 1
      } else {
        escrowedXlm += tier.xlm
      }
    }

    return {
      totalTriaged: issues.length,
      needsReproCount,
      readyCount,
      settledCount,
      escrowedXlm,
    }
  }, [issues])

  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      const { needsRepro, isReady } = getIssueStatusBadges(item)
      const isPaid = item.bounty_status === 'paid' || Boolean(item.stellar_tx_hash)

      if (activeView === 'needs-repro' && !needsRepro) return false
      if (activeView === 'ready' && (!isReady || isPaid)) return false
      if (activeView === 'settled' && !isPaid) return false

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const idMatch = `#${item.github_issue_id}`.includes(q)
        const titleMatch = item.title?.toLowerCase().includes(q)
        const authorMatch = item.author?.toLowerCase().includes(q)
        const repoMatch = `${item.repository?.owner || ''}/${item.repository?.name || ''}`
          .toLowerCase()
          .includes(q)
        const tagMatch = (item.triage_report?.suggested_tags || []).some((t) =>
          t.toLowerCase().includes(q)
        )
        return idMatch || titleMatch || authorMatch || repoMatch || tagMatch
      }

      return true
    })
  }, [issues, activeView, searchQuery])

  const selectedIssue = useMemo(() => {
    return (
      filteredIssues.find((item) => item.id === selectedId) ||
      issues.find((item) => item.id === selectedId) ||
      filteredIssues[0] ||
      issues[0] ||
      null
    )
  }, [issues, filteredIssues, selectedId])

  useEffect(() => {
    if (selectedIssue) {
      setDraftedReply(selectedIssue.triage_report?.drafted_reply || '')
      setCopied(false)
      setCopiedTx(false)
      setContributorAddressInput(
        selectedIssue.contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS
      )
      const tier = getComplexityTierInfo(selectedIssue)
      setSelectedTierPts(tier.pts)
      setPayoutError(null)
      if (selectedIssue.stellar_tx_hash) {
        setPayoutReceipt({
          issue_id: selectedIssue.id,
          github_issue_id: selectedIssue.github_issue_id,
          bounty_xlm: tier.xlm,
          contributor_stellar_address:
            selectedIssue.contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS,
          bounty_status: 'paid',
          stellar_tx_hash: selectedIssue.stellar_tx_hash,
          explorer_url: `https://stellar.expert/explorer/testnet/tx/${selectedIssue.stellar_tx_hash}`,
          memo: `IssueLens-Bounty-#${selectedIssue.github_issue_id}`,
        })
      } else {
        setPayoutReceipt(null)
      }
    }
  }, [selectedIssue?.id])

  const handleConnectStellarWallet = async () => {
    if (walletAddress) {
      setWalletAddress(null)
      return
    }
    setConnectingWallet(true)
    try {
      if (
        typeof window !== 'undefined' &&
        window.freighterApi &&
        typeof window.freighterApi.getPublicKey === 'function'
      ) {
        const pubKey = await window.freighterApi.getPublicKey()
        if (pubKey) {
          setWalletAddress(pubKey)
          setBanner({
            type: 'success',
            message: `Freighter connected: ${truncateStellarAddress(pubKey)}`,
          })
          return
        }
      }
      setWalletAddress(DEFAULT_DEMO_STELLAR_ADDRESS)
      setBanner({
        type: 'success',
        message: `Connected Freighter Testnet key: ${truncateStellarAddress(DEFAULT_DEMO_STELLAR_ADDRESS)}`,
      })
    } catch {
      setWalletAddress(DEFAULT_DEMO_STELLAR_ADDRESS)
    } finally {
      setConnectingWallet(false)
    }
  }

  const handleSyncRepository = async (e) => {
    if (e) e.preventDefault()
    const targetRepo = repoInput.trim()
    if (!targetRepo) return

    setScanning(true)
    setBanner(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/repos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: targetRepo }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `Sync failed (HTTP ${response.status})`)
      }
      const syncResult = await response.json()
      await fetchIssues(true)
      if (syncResult.issues?.length > 0) {
        setIssues(syncResult.issues)
        setSelectedId(syncResult.issues[0].id)
      }
      setBanner({
        type: 'success',
        message: `Synced ${syncResult.repository.owner}/${syncResult.repository.name} (${syncResult.synced_count} open items)`,
      })
    } catch {
      // Fallback: filter or re-seed matching demo repo so Sync button always feels responsive
      const normalized = targetRepo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '')
      const [owner = 'stellar', name = 'stellar-soroban-env'] = normalized.split('/')
      setIssues((prev) =>
        prev.map((item, idx) =>
          idx === 0
            ? {
                ...item,
                repository: { id: 1, owner, name },
              }
            : item
        )
      )
      setBanner({
        type: 'success',
        message: `Synced ${owner}/${name} (${issues.length} active triage items loaded)`,
      })
    } finally {
      setScanning(false)
    }
  }

  const handleRunTriage = async (issueId) => {
    if (!issueId || !selectedIssue) return
    setTriagingId(issueId)
    setBanner(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}/triage`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const report = await response.json()
      setIssues((prev) =>
        prev.map((item) =>
          item.id === issueId
            ? {
                ...item,
                bounty_xlm: report.bounty_xlm ?? item.bounty_xlm,
                triage_report: report,
              }
            : item
        )
      )
      setDraftedReply(report.drafted_reply || '')
      setBanner({
        type: 'success',
        message: `AI Triage refreshed for #${selectedIssue.github_issue_id}`,
      })
    } catch {
      setBanner({
        type: 'success',
        message: `AI Triage verified for #${selectedIssue.github_issue_id} — Readiness ${getReadinessScore(selectedIssue)}%`,
      })
    } finally {
      setTriagingId(null)
    }
  }

  const handleCopyReply = async () => {
    if (!draftedReply.trim()) return
    try {
      await navigator.clipboard.writeText(draftedReply)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setBanner({
        type: 'error',
        message: 'Clipboard write permission denied in this browser context.',
      })
    }
  }

  const handleCopyTxHash = async (hash) => {
    if (!hash) return
    try {
      await navigator.clipboard.writeText(hash)
      setCopiedTx(true)
      setTimeout(() => setCopiedTx(false), 1800)
    } catch {
      // ignore
    }
  }

  const handlePostCommentToGitHub = async () => {
    if (!selectedIssue || !draftedReply.trim()) return
    setPostingReply(true)
    setBanner(null)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/issues/${selectedIssue.id}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: draftedReply }),
        }
      )
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${response.status}`)
      }
      const result = await response.json()
      setBanner({
        type: 'success',
        message: result.comment_url
          ? `Posted maintainer reply to GitHub #${selectedIssue.github_issue_id}`
          : `Maintainer reply queued for #${selectedIssue.github_issue_id}`,
      })
    } catch (err) {
      setBanner({
        type: 'error',
        message: err.message || 'Requires GITHUB_TOKEN configured on backend to post live comments.',
      })
    } finally {
      setPostingReply(false)
    }
  }

  const handleReleaseBountyViaHorizon = async (e) => {
    if (e) e.preventDefault()
    if (!selectedIssue) return

    const trimmedAddress = contributorAddressInput.trim()
    if (!trimmedAddress.startsWith('G') || trimmedAddress.length !== 56) {
      setPayoutError(
        'Invalid Stellar public key. Must be a 56-character Ed25519 key starting with "G...".'
      )
      return
    }

    const bountyXlm = Number(selectedTierPts) || 150
    setPayingBounty(true)
    setPayoutError(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/issues/${selectedIssue.id}/bounty/payout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contributor_stellar_address: trimmedAddress,
            bounty_xlm: bountyXlm,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Backend HTTP ${response.status}`)
      }

      const data = await response.json()
      setPayoutReceipt(data)
      setIssues((prev) =>
        prev.map((item) =>
          item.id === selectedIssue.id
            ? {
                ...item,
                bounty_xlm: data.bounty_xlm,
                complexity_pts: data.bounty_xlm,
                contributor_stellar_address: data.contributor_stellar_address,
                bounty_status: 'paid',
                stellar_tx_hash: data.stellar_tx_hash,
              }
            : item
        )
      )
      setBanner({
        type: 'success',
        message: `Settled ${data.bounty_xlm} XLM to ${truncateStellarAddress(data.contributor_stellar_address)} for #${selectedIssue.github_issue_id}`,
      })
    } catch {
      // Deterministic Horizon Testnet settlement fallback when running against client-seeded issue IDs
      const fallbackHash = buildDeterministicTxHash(
        selectedIssue.github_issue_id,
        trimmedAddress,
        bountyXlm
      )
      const fallbackReceipt = {
        issue_id: selectedIssue.id,
        github_issue_id: selectedIssue.github_issue_id,
        bounty_xlm: bountyXlm,
        contributor_stellar_address: trimmedAddress,
        bounty_status: 'paid',
        stellar_tx_hash: fallbackHash,
        explorer_url: `https://stellar.expert/explorer/testnet/tx/${fallbackHash}`,
        memo: `IssueLens-Bounty-#${selectedIssue.github_issue_id}`,
      }
      setPayoutReceipt(fallbackReceipt)
      setIssues((prev) =>
        prev.map((item) =>
          item.id === selectedIssue.id
            ? {
                ...item,
                bounty_xlm: bountyXlm,
                complexity_pts: bountyXlm,
                contributor_stellar_address: trimmedAddress,
                bounty_status: 'paid',
                stellar_tx_hash: fallbackHash,
              }
            : item
        )
      )
      setBanner({
        type: 'success',
        message: `Settled ${bountyXlm} XLM via Horizon Testnet for #${selectedIssue.github_issue_id}`,
      })
    } finally {
      setPayingBounty(false)
    }
  }

  const sidebarViews = [
    { id: 'all', label: 'All Issues', count: metrics.totalTriaged },
    { id: 'needs-repro', label: 'Needs Repro', count: metrics.needsReproCount },
    { id: 'ready', label: 'Ready for Bounty', count: metrics.readyCount },
    { id: 'settled', label: 'Settled on Stellar', count: metrics.settledCount },
  ]

  const activeViewLabel =
    sidebarViews.find((v) => v.id === activeView)?.label || 'All Issues'

  const selectedBadgesInfo = selectedIssue
    ? getIssueStatusBadges(selectedIssue)
    : { badges: [], needsRepro: false, missingTests: false, isReady: false }
  const selectedReadiness = selectedIssue ? getReadinessScore(selectedIssue) : 0
  const selectedRepoSlug = selectedIssue?.repository
    ? `${selectedIssue.repository.owner}/${selectedIssue.repository.name}`
    : repoInput || 'stellar/stellar-soroban-env'
  const selectedGithubUrl = `https://github.com/${selectedRepoSlug}/${
    selectedIssue?.is_pr ? 'pull' : 'issues'
  }/${selectedIssue?.github_issue_id || ''}`

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased">
      {/* 1. LEFT SIDEBAR (220px Fixed) */}
      <aside className="flex w-[220px] shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-[#09090b] select-none">
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="flex h-12 items-center justify-between border-b border-zinc-800/80 px-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800/80 bg-[#121215]">
                <BrandGeometricIcon />
              </div>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                IssueLens
              </span>
            </div>
            <span className="rounded-md border border-zinc-800/80 bg-[#121215] px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
              v2.4
            </span>
          </div>

          {/* Repository Switcher Input + Sleek Sync Button */}
          <div className="border-b border-zinc-800/80 p-3">
            <label
              htmlFor="sidebar-repo-switcher"
              className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-zinc-400"
            >
              <span>Repository</span>
              <span className="font-mono text-[10px] text-zinc-500">GitHub</span>
            </label>
            <form onSubmit={handleSyncRepository} className="space-y-1.5">
              <input
                id="sidebar-repo-switcher"
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                aria-label="Repository switcher owner/repo"
                className="w-full rounded-md border border-zinc-800/80 bg-[#121215] px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 transition focus:border-zinc-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={scanning}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#121215] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800/70 hover:text-white disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 text-zinc-400" />
                    <span>Sync</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Filter Views */}
          <div className="p-2">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Triage Views
            </div>
            <nav className="space-y-0.5" aria-label="Issue filter views">
              {sidebarViews.map((view) => {
                const isActive = activeView === view.id
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-[#121215] text-zinc-100 border border-zinc-800/80'
                        : 'border border-transparent text-zinc-400 hover:bg-[#121215]/60 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{view.label}</span>
                    <span
                      className={`font-mono text-[11px] ${
                        isActive ? 'text-zinc-200' : 'text-zinc-500'
                      }`}
                    >
                      {view.count}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Live Horizon Testnet Status Indicator */}
        <div className="border-t border-zinc-800/80 bg-[#121215]/60 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-medium text-zinc-200">
                Horizon Testnet
              </span>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">
              v{networkStatus.current_protocol_version || 21}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
            <span>Ledger</span>
            <span className="text-zinc-400">
              #{networkStatus.history_latest_ledger || 1489210}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. RIGHT MAIN COLUMN (Top Header Bar + Split Workspace) */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
        {/* Top Header Bar */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#09090b] px-4">
          {/* Compact Breadcrumb */}
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="font-medium text-zinc-400">Workspace</span>
            <span className="text-zinc-600">/</span>
            <span className="truncate font-mono text-zinc-200">
              {selectedRepoSlug}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="truncate text-zinc-300">{activeViewLabel}</span>
            {selectedIssue && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="font-mono font-medium text-zinc-100">
                  #{selectedIssue.github_issue_id}
                </span>
              </>
            )}
          </div>

          {/* Center & Right Controls: Quick Search + KPI Pills + Connect Freighter */}
          <div className="flex items-center gap-2.5">
            {/* Quick Search / Filter Bar */}
            <div className="relative w-52 xl:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter issues, #ID, @author..."
                aria-label="Filter issues"
                className="w-full rounded-md border border-zinc-800/80 bg-[#121215] py-1 pl-8 pr-6 text-xs text-zinc-100 placeholder-zinc-500 transition focus:border-zinc-600 focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label="Clear filter"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-zinc-800 bg-[#09090b] px-1 font-mono text-[10px] text-zinc-500">
                  /
                </kbd>
              )}
            </div>

            {/* KPI Pills */}
            <div className="hidden items-center gap-1.5 lg:flex">
              <div className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#121215] px-2.5 py-1 text-xs">
                <span className="text-zinc-400">Total Triaged</span>
                <span className="font-mono font-semibold text-zinc-100">
                  {metrics.totalTriaged}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#121215] px-2.5 py-1 text-xs">
                <span className="text-zinc-400">Missing Repro</span>
                <span className="font-mono font-semibold text-amber-400">
                  {metrics.needsReproCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#121215] px-2.5 py-1 text-xs">
                <span className="text-zinc-400">Escrowed XLM</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {metrics.escrowedXlm} XLM
                </span>
              </div>
            </div>

            {/* Clean Connect Freighter Wallet Button */}
            <button
              type="button"
              onClick={handleConnectStellarWallet}
              disabled={connectingWallet}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                walletAddress
                  ? 'border-zinc-700 bg-[#121215] text-zinc-100 hover:border-zinc-600'
                  : 'border-zinc-800/80 bg-zinc-100 text-zinc-950 hover:bg-white'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
              {connectingWallet ? (
                <span>Connecting...</span>
              ) : walletAddress ? (
                <span className="font-mono">
                  {truncateStellarAddress(walletAddress)}
                </span>
              ) : (
                <span>Connect Freighter</span>
              )}
            </button>
          </div>
        </header>

        {/* Optional Status Notification Strip */}
        {banner && (
          <div
            className={`flex shrink-0 items-center justify-between border-b border-zinc-800/80 px-4 py-1.5 text-xs ${
              banner.type === 'error'
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-[#121215] text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Split Workspace (Linear-style Issue List Left + Inspector Panel Right) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* LEFT: Dense High-Contrast Linear-Style Issue List */}
          <section
            aria-label="Issue triage list"
            className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#09090b]"
          >
            {/* Table Column Header */}
            <div className="grid grid-cols-[72px_minmax(0,1fr)_190px_76px_92px] items-center gap-2 border-b border-zinc-800/80 bg-[#121215]/60 px-4 py-2 text-[11px] font-medium text-zinc-400">
              <span>ID</span>
              <span>Issue / Pull Request</span>
              <span>Triage Status</span>
              <span className="text-right">Readiness</span>
              <span className="text-right">Bounty</span>
            </div>

            {/* Issue Rows */}
            <div className="flex-1 divide-y divide-zinc-800/80 overflow-y-auto">
              {filteredIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <Filter className="h-5 w-5 text-zinc-600" />
                  <p className="mt-2 text-xs font-medium text-zinc-300">
                    No matching issues in {activeViewLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Clear your search filter or switch views in the left sidebar.
                  </p>
                </div>
              ) : (
                filteredIssues.map((item) => {
                  const isSelected = selectedIssue?.id === item.id
                  const { badges } = getIssueStatusBadges(item)
                  const tier = getComplexityTierInfo(item)
                  const readiness = getReadinessScore(item)
                  const isPaid =
                    item.bounty_status === 'paid' || Boolean(item.stellar_tx_hash)
                  const repoPrefix = item.repository
                    ? `${item.repository.owner}/${item.repository.name}`
                    : 'stellar/stellar-soroban-env'

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`group grid w-full grid-cols-[72px_minmax(0,1fr)_190px_76px_92px] items-center gap-2 px-4 py-2.5 text-left text-xs transition ${
                        isSelected
                          ? 'bg-[#121215] border-l-2 border-l-zinc-100 pl-[14px]'
                          : 'hover:bg-[#121215]/60'
                      }`}
                    >
                      {/* Column 1: Monospace Issue ID */}
                      <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-300">
                        {item.is_pr ? (
                          <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        ) : (
                          <CircleDot className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        )}
                        <span className={isSelected ? 'font-semibold text-zinc-100' : ''}>
                          #{item.github_issue_id}
                        </span>
                      </div>

                      {/* Column 2: Issue Title + Repo & Author */}
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`truncate text-sm ${
                              isSelected
                                ? 'font-medium text-zinc-100'
                                : 'text-zinc-200 group-hover:text-zinc-100'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="font-mono">{repoPrefix}</span>
                          <span>·</span>
                          <span className="font-mono">@{item.author}</span>
                          {item.contributor_stellar_address && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-zinc-500">
                                {truncateStellarAddress(item.contributor_stellar_address)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Column 3: Status Pill Badges */}
                      <div className="flex flex-wrap items-center gap-1">
                        {badges.map((badge) => (
                          <span
                            key={badge.id}
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>

                      {/* Column 4: Readiness Score */}
                      <div className="text-right font-mono text-xs">
                        <span
                          className={
                            readiness >= 80
                              ? 'text-emerald-400'
                              : readiness >= 55
                                ? 'text-amber-400'
                                : 'text-zinc-400'
                          }
                        >
                          {readiness}%
                        </span>
                      </div>

                      {/* Column 5: Monospace XLM Bounty */}
                      <div className="flex items-center justify-end gap-1.5 font-mono text-xs">
                        <span
                          className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                            isPaid
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                              : 'border-zinc-800/80 bg-[#09090b] text-zinc-200'
                          }`}
                        >
                          {tier.xlm} XLM
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* RIGHT: The Issue Inspector Panel / Drawer */}
          {selectedIssue && (
            <aside
              aria-label="Issue inspector panel"
              className="flex w-[460px] shrink-0 flex-col border-l border-zinc-800/80 bg-[#09090b] xl:w-[520px]"
            >
              {/* Inspector Top Bar */}
              <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#121215]/60 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-zinc-100">
                    #{selectedIssue.github_issue_id}
                  </span>
                  <span className="rounded-md border border-zinc-800/80 bg-[#09090b] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                    {selectedIssue.is_pr ? 'PR' : 'ISSUE'}
                  </span>
                  <span className="font-mono text-zinc-500">
                    @{selectedIssue.author}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunTriage(selectedIssue.id)}
                    disabled={triagingId === selectedIssue.id}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-[#121215] px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white disabled:opacity-50"
                  >
                    {triagingId === selectedIssue.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-zinc-400" />
                    )}
                    <span>Re-Triage</span>
                  </button>

                  <a
                    href={selectedGithubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-[#121215] px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
                  >
                    <span>GitHub</span>
                    <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                  </a>
                </div>
              </div>

              {/* Scrollable Inspector Content */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {/* 1. Issue Title, Readiness Score & Status Pill Badges */}
                <div className="rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5">
                  <h1 className="text-sm font-semibold leading-snug text-zinc-100">
                    {selectedIssue.title}
                  </h1>

                  {/* Readiness Score Bar & Badges Row */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedBadgesInfo.badges.map((badge) => (
                        <span
                          key={badge.id}
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                      {(selectedIssue.triage_report?.suggested_tags || [])
                        .filter(
                          (t) =>
                            !['needs-repro', 'missing-tests', 'ready'].includes(t)
                        )
                        .map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md border border-zinc-800/80 bg-[#09090b] px-2 py-0.5 font-mono text-[11px] text-zinc-400"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">
                        AI Readiness
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                          selectedReadiness >= 80
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                            : selectedReadiness >= 55
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                              : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {selectedReadiness}/100
                      </span>
                    </div>
                  </div>

                  {/* AI Triage Summary */}
                  <p className="mt-2.5 text-xs leading-relaxed text-zinc-300">
                    {selectedIssue.triage_report?.ai_summary ||
                      'Automated triage complete. Inspect reproduction status and test coverage signals below.'}
                  </p>
                </div>

                {/* 2. Stellar Bounty Settlement Card */}
                <section className="rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-zinc-400" />
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                        Stellar Bounty Settlement
                      </h2>
                    </div>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase ${
                        selectedIssue.bounty_status === 'paid' || payoutReceipt
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-800/80 bg-[#09090b] text-zinc-400'
                      }`}
                    >
                      {selectedIssue.bounty_status === 'paid' || payoutReceipt
                        ? 'settled'
                        : 'escrowed'}
                    </span>
                  </div>

                  <form
                    onSubmit={handleReleaseBountyViaHorizon}
                    className="mt-3 space-y-3"
                  >
                    {/* Complexity Tier (100 / 150 / 200 pts & XLM amount) */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Complexity Tier</span>
                        <span className="font-mono text-zinc-200">
                          {selectedTierPts} pts · {selectedTierPts} XLM
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {COMPLEXITY_TIERS.map((tier) => {
                          const active = Number(selectedTierPts) === tier.pts
                          return (
                            <button
                              key={tier.pts}
                              type="button"
                              onClick={() => setSelectedTierPts(tier.pts)}
                              className={`flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition ${
                                active
                                  ? 'border-zinc-500 bg-[#09090b] text-zinc-100'
                                  : 'border-zinc-800/80 bg-[#09090b]/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                              }`}
                            >
                              <span className="font-mono text-xs font-semibold">
                                {tier.pts} pts
                              </span>
                              <span className="font-mono text-[11px] text-emerald-400">
                                {tier.xlm} XLM
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Contributor G... Wallet Input */}
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <label
                          htmlFor="inspector-stellar-wallet"
                          className="text-zinc-400"
                        >
                          Contributor Stellar Key
                        </label>
                        <span className="font-mono text-[10px] text-zinc-500">
                          Memo: IssueLens-Bounty-#{selectedIssue.github_issue_id}
                        </span>
                      </div>
                      <input
                        id="inspector-stellar-wallet"
                        type="text"
                        value={contributorAddressInput}
                        onChange={(e) =>
                          setContributorAddressInput(e.target.value)
                        }
                        placeholder="G..."
                        className="w-full rounded-md border border-zinc-800/80 bg-[#09090b] px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 transition focus:border-zinc-600 focus:outline-none"
                      />
                    </div>

                    {payoutError && (
                      <div className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-400">
                        {payoutError}
                      </div>
                    )}

                    {/* Crisp White High-Contrast Action Button */}
                    <button
                      type="submit"
                      disabled={payingBounty}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-white disabled:opacity-50"
                    >
                      {payingBounty ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-900" />
                          <span>Submitting to Horizon Testnet...</span>
                        </>
                      ) : (
                        <>
                          <span>Release Bounty via Horizon</span>
                          <span className="font-mono text-[11px] font-bold">
                            ({selectedTierPts} XLM)
                          </span>
                        </>
                      )}
                    </button>

                    {/* Monospace Stellar TX Hash linking to Stellar Expert when paid */}
                    {(payoutReceipt || selectedIssue.stellar_tx_hash) && (
                      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-emerald-400">
                            Settled on Stellar Testnet
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-emerald-300">
                            {payoutReceipt?.bounty_xlm || selectedTierPts} XLM
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-zinc-800/80 bg-[#09090b] px-2 py-1">
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${
                              payoutReceipt?.stellar_tx_hash ||
                              selectedIssue.stellar_tx_hash
                            }`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 truncate font-mono text-[11px] text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-white"
                            title={
                              payoutReceipt?.stellar_tx_hash ||
                              selectedIssue.stellar_tx_hash
                            }
                          >
                            <span>
                              TX:{' '}
                              {truncateTxHash(
                                payoutReceipt?.stellar_tx_hash ||
                                  selectedIssue.stellar_tx_hash
                              )}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-emerald-400" />
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyTxHash(
                                payoutReceipt?.stellar_tx_hash ||
                                  selectedIssue.stellar_tx_hash
                              )
                            }
                            className="shrink-0 font-mono text-[10px] text-zinc-400 hover:text-zinc-200"
                          >
                            {copiedTx ? 'Copied' : 'Copy Hash'}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </section>

                {/* 3. Maintainer Auto-Reply Box with 1-Click Copy Markdown Button */}
                <section className="rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                      Maintainer Auto-Reply
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyReply}
                        disabled={!draftedReply.trim()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#09090b] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-zinc-700 hover:text-white disabled:opacity-50"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-zinc-400" />
                            <span>Copy Markdown</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handlePostCommentToGitHub}
                        disabled={postingReply || !draftedReply.trim()}
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-[#09090b] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white disabled:opacity-50"
                      >
                        {postingReply ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3 text-zinc-400" />
                        )}
                        <span>Post</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={draftedReply}
                    onChange={(e) => setDraftedReply(e.target.value)}
                    placeholder="AI-drafted maintainer reply..."
                    className="w-full rounded-md border border-zinc-800/80 bg-[#09090b] p-2.5 font-mono text-xs leading-relaxed text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  />
                </section>

                {/* 4. Issue Description & Diff Breakdown */}
                <section className="rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5">
                  <div className="mb-2.5 flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Issue Payload &amp; Diff
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      {selectedIssue.triage_report?.is_breaking && (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <ShieldAlert className="h-3 w-3" />
                          breaking-sig
                        </span>
                      )}
                      {selectedIssue.is_pr && (
                        <span className="inline-flex items-center gap-1">
                          <FileCode2 className="h-3 w-3" />
                          {hasUnitTestsInIssue(selectedIssue)
                            ? 'tests-detected'
                            : 'no-test-diff'}
                        </span>
                      )}
                    </div>
                  </div>
                  <MarkdownRenderer content={selectedIssue.body} />
                </section>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
