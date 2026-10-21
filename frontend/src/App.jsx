import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  CircleDot,
  Coins,
  Copy,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  Loader2,
  MessageSquareReply,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Tag,
  Terminal,
  User,
  Wallet,
  X,
} from 'lucide-react'
import MarkdownRenderer from './components/MarkdownRenderer.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const DEFAULT_DEMO_STELLAR_ADDRESS =
  'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

function hasUnitTestsInIssue(issue) {
  const diffSource = `${issue?.diff || ''}\n${issue?.body || ''}`
  return /(?:test_[\w.-]+\.py|[\w.-]+_test\.py|[\w.-]+\.(?:test|spec)\.(?:tsx|ts|jsx|js)|\/__tests__\/|\/tests?\/)/i.test(
    diffSource
  )
}

function getRecommendedBountyXlm(issue) {
  if (typeof issue?.bounty_xlm === 'number' && issue.bounty_xlm > 0) {
    return issue.bounty_xlm
  }
  if (
    typeof issue?.triage_report?.bounty_xlm === 'number' &&
    issue.triage_report.bounty_xlm > 0
  ) {
    return issue.triage_report.bounty_xlm
  }
  if (issue?.triage_report?.is_breaking) return 150
  if (issue?.triage_report?.suggested_tags?.includes('good-first-issue')) {
    return 25
  }
  return 75
}

function getComplexityLabel(bountyXlm, report) {
  if (report?.complexity) return report.complexity
  if (bountyXlm >= 150) return 'High'
  if (bountyXlm <= 25) return 'Low'
  return 'Medium'
}

function truncateStellarAddress(addr) {
  if (!addr || addr.length < 12) return addr || ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function App() {
  const [repoInput, setRepoInput] = useState('facebook/react')
  const [issues, setIssues] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [triagingId, setTriagingId] = useState(null)
  const [postingReply, setPostingReply] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draftedReply, setDraftedReply] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'issue' | 'pr'
  const [banner, setBanner] = useState(null) // { type: 'error' | 'success', message: string }

  // Stellar Network & Wallet State
  const [networkStatus, setNetworkStatus] = useState({
    status: 'online',
    network: 'TESTNET',
    horizon_url: 'https://horizon-testnet.stellar.org',
    history_latest_ledger: 0,
    current_protocol_version: 21,
    demo_simulation_enabled: true,
  })
  const [walletAddress, setWalletAddress] = useState(null)
  const [connectingWallet, setConnectingWallet] = useState(false)

  // Release Stellar Bounty Modal / Drawer State
  const [bountyModalOpen, setBountyModalOpen] = useState(false)
  const [contributorAddressInput, setContributorAddressInput] = useState(
    DEFAULT_DEMO_STELLAR_ADDRESS
  )
  const [bountyAmountInput, setBountyAmountInput] = useState(75)
  const [payingBounty, setPayingBounty] = useState(false)
  const [payoutReceipt, setPayoutReceipt] = useState(null)
  const [payoutError, setPayoutError] = useState(null)

  const fetchIssues = async (selectFirst = false) => {
    setLoadingIssues(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues`)
      if (!response.ok) {
        throw new Error(`Failed to fetch issues (HTTP ${response.status})`)
      }
      const data = await response.json()
      setIssues(data)
      if (data.length > 0 && (selectFirst || selectedId === null)) {
        setSelectedId(data[0].id)
      }
    } catch (err) {
      setBanner({
        type: 'error',
        message: err.message || 'Unable to connect to IssueLens backend service.',
      })
    } finally {
      setLoadingIssues(false)
    }
  }

  const fetchStellarNetworkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stellar/network-status`)
      if (!response.ok) return
      const data = await response.json()
      setNetworkStatus(data)
    } catch {
      // Keep last known Testnet status indicator if backend is temporarily unreachable
    }
  }

  useEffect(() => {
    fetchIssues(true)
    fetchStellarNetworkStatus()
    const intervalId = setInterval(fetchStellarNetworkStatus, 15000)
    return () => clearInterval(intervalId)
  }, [])

  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      if (filterType === 'issue') return !item.is_pr
      if (filterType === 'pr') return item.is_pr
      return true
    })
  }, [issues, filterType])

  const selectedIssue = useMemo(() => {
    return (
      issues.find((item) => item.id === selectedId) ||
      filteredIssues[0] ||
      null
    )
  }, [issues, filteredIssues, selectedId])

  useEffect(() => {
    if (selectedIssue) {
      setDraftedReply(selectedIssue.triage_report?.drafted_reply || '')
      setCopied(false)
      setContributorAddressInput(
        selectedIssue.contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS
      )
      setBountyAmountInput(getRecommendedBountyXlm(selectedIssue))
      setPayoutError(null)
      if (selectedIssue.stellar_tx_hash) {
        setPayoutReceipt({
          issue_id: selectedIssue.id,
          github_issue_id: selectedIssue.github_issue_id,
          bounty_xlm: getRecommendedBountyXlm(selectedIssue),
          contributor_stellar_address:
            selectedIssue.contributor_stellar_address ||
            DEFAULT_DEMO_STELLAR_ADDRESS,
          bounty_status: selectedIssue.bounty_status || 'paid',
          stellar_tx_hash: selectedIssue.stellar_tx_hash,
          tx_hash: selectedIssue.stellar_tx_hash,
          explorer_url: `https://stellar.expert/explorer/testnet/tx/${selectedIssue.stellar_tx_hash}`,
          memo: `IssueLens-Bounty-#${selectedIssue.github_issue_id}`,
          simulated: networkStatus.demo_simulation_enabled,
        })
      } else {
        setPayoutReceipt(null)
      }
    } else {
      setDraftedReply('')
      setPayoutReceipt(null)
    }
  }, [selectedIssue?.id, selectedIssue?.triage_report?.drafted_reply])

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
            message: `Connected Freighter Stellar Wallet: ${truncateStellarAddress(pubKey)}`,
          })
          return
        }
      }
      // Fallback to IssueLens Testnet Escrow Demo Wallet if Freighter extension is not installed
      setWalletAddress(DEFAULT_DEMO_STELLAR_ADDRESS)
      setBanner({
        type: 'success',
        message: `Connected Stellar Testnet Escrow Wallet (${truncateStellarAddress(DEFAULT_DEMO_STELLAR_ADDRESS)})`,
      })
    } catch {
      setWalletAddress(DEFAULT_DEMO_STELLAR_ADDRESS)
    } finally {
      setConnectingWallet(false)
    }
  }

  const handleOpenBountyModal = (issueItem = selectedIssue) => {
    const target = issueItem || selectedIssue
    if (!target) return
    if (target.id !== selectedId) {
      setSelectedId(target.id)
    }
    setContributorAddressInput(
      target.contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS
    )
    setBountyAmountInput(getRecommendedBountyXlm(target))
    setPayoutError(null)
    if (target.stellar_tx_hash) {
      setPayoutReceipt({
        issue_id: target.id,
        github_issue_id: target.github_issue_id,
        bounty_xlm: getRecommendedBountyXlm(target),
        contributor_stellar_address:
          target.contributor_stellar_address || DEFAULT_DEMO_STELLAR_ADDRESS,
        bounty_status: target.bounty_status || 'paid',
        stellar_tx_hash: target.stellar_tx_hash,
        tx_hash: target.stellar_tx_hash,
        explorer_url: `https://stellar.expert/explorer/testnet/tx/${target.stellar_tx_hash}`,
        memo: `IssueLens-Bounty-#${target.github_issue_id}`,
        simulated: networkStatus.demo_simulation_enabled,
      })
    } else {
      setPayoutReceipt(null)
    }
    setBountyModalOpen(true)
  }

  const handlePayViaStellarHorizon = async (e) => {
    if (e) e.preventDefault()
    if (!selectedIssue) return

    const trimmedAddress = contributorAddressInput.trim()
    if (!trimmedAddress.startsWith('G') || trimmedAddress.length !== 56) {
      setPayoutError(
        'Please enter a valid 56-character Stellar public key starting with "G...".'
      )
      return
    }

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
            bounty_xlm: Number(bountyAmountInput) || getRecommendedBountyXlm(selectedIssue),
          }),
        }
      )
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(
          errData.detail || `Stellar payout failed (HTTP ${response.status})`
        )
      }
      const data = await response.json()
      setPayoutReceipt(data)
      setIssues((prev) =>
        prev.map((item) =>
          item.id === selectedIssue.id
            ? {
                ...item,
                bounty_xlm: data.bounty_xlm,
                contributor_stellar_address: data.contributor_stellar_address,
                bounty_status: data.bounty_status,
                stellar_tx_hash: data.stellar_tx_hash,
              }
            : item
        )
      )
      setBanner({
        type: 'success',
        message: `Paid ${data.bounty_xlm} XLM bounty for #${data.github_issue_id} on Stellar Testnet (tx: ${data.stellar_tx_hash.slice(0, 10)}...).`,
      })
    } catch (err) {
      setPayoutError(
        err.message || 'Unable to submit Stellar Horizon bounty transaction.'
      )
    } finally {
      setPayingBounty(false)
    }
  }

  const handleScanRepository = async (e) => {
    e.preventDefault()
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
        throw new Error(errData.detail || `Repository scan failed (${response.status})`)
      }
      const syncResult = await response.json()
      await fetchIssues(true)
      if (syncResult.issues?.length > 0) {
        setSelectedId(syncResult.issues[0].id)
      }
      setBanner({
        type: 'success',
        message: `Scanned ${syncResult.repository.owner}/${syncResult.repository.name} — synced ${syncResult.synced_count} open issues & PRs.`,
      })
    } catch (err) {
      setBanner({
        type: 'error',
        message: err.message || 'Failed to scan GitHub repository.',
      })
    } finally {
      setScanning(false)
    }
  }

  const handleRunTriage = async (issueId) => {
    if (!issueId) return
    setTriagingId(issueId)
    setBanner(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}/triage`, {
        method: 'POST',
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `AI triage failed (${response.status})`)
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
      if (report.bounty_xlm) {
        setBountyAmountInput(report.bounty_xlm)
      }
      setBanner({
        type: 'success',
        message: `AI Triage completed for #${selectedIssue?.github_issue_id || issueId} — Recommended Bounty: ${report.bounty_xlm || 75} XLM.`,
      })
    } catch (err) {
      setBanner({
        type: 'error',
        message: err.message || 'Failed to run AI triage analysis.',
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
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setBanner({
        type: 'error',
        message: 'Could not copy to clipboard in this browser context.',
      })
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
        throw new Error(errData.detail || `Failed to post comment (${response.status})`)
      }
      const result = await response.json()
      setBanner({
        type: 'success',
        message: result.comment_url
          ? `Comment posted to GitHub (#${selectedIssue.github_issue_id}): ${result.comment_url}`
          : `Maintainer reply posted to GitHub #${selectedIssue.github_issue_id}.`,
      })
    } catch (err) {
      setBanner({
        type: 'error',
        message: err.message || 'Unable to post comment to GitHub.',
      })
    } finally {
      setPostingReply(false)
    }
  }

  const report = selectedIssue?.triage_report
  const prHasTests = selectedIssue?.is_pr ? hasUnitTestsInIssue(selectedIssue) : false
  const selectedBountyXlm = selectedIssue ? getRecommendedBountyXlm(selectedIssue) : 75
  const selectedComplexity = selectedIssue
    ? getComplexityLabel(selectedBountyXlm, report)
    : 'Medium'

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. Header Bar with Stellar Testnet Live Badge & Freighter Wallet Button */}
      <header className="sticky top-0 z-20 border-b border-neutral-800/90 bg-neutral-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          {/* Brand Title & Ecosystem Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-indigo-400 shadow-inner">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-white">
                IssueLens
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-indigo-300">
                AI Triage &amp; Drips
              </span>

              {/* Live Stellar Testnet Horizon Ledger Badge */}
              <div
                title={`Horizon: ${networkStatus.horizon_url || 'https://horizon-testnet.stellar.org'}`}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span>Stellar Testnet Connected</span>
                {networkStatus.history_latest_ledger > 0 && (
                  <span className="hidden rounded bg-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200 sm:inline">
                    Ledger #{networkStatus.history_latest_ledger}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Controls: Repo Scanner + Connect Freighter / Stellar Wallet */}
          <div className="flex flex-wrap items-center gap-3">
            <form
              onSubmit={handleScanRepository}
              className="flex w-full max-w-md items-center gap-2 sm:w-auto"
            >
              <div className="relative flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="owner/repo (e.g. facebook/react)"
                  aria-label="GitHub repository owner/repo"
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder-neutral-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={scanning}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <Terminal className="h-4 w-4" />
                    <span>Scan Repo</span>
                  </>
                )}
              </button>
            </form>

            {/* Connect Freighter / Stellar Wallet Button */}
            <button
              type="button"
              onClick={handleConnectStellarWallet}
              disabled={connectingWallet}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                walletAddress
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                  : 'border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25'
              }`}
            >
              <Wallet className="h-3.5 w-3.5 text-purple-300" />
              {connectingWallet ? (
                <span>Connecting...</span>
              ) : walletAddress ? (
                <span className="font-mono">
                  Wallet: {truncateStellarAddress(walletAddress)}
                </span>
              ) : (
                <span>Connect Freighter / Stellar Wallet</span>
              )}
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {banner && (
          <div
            className={`border-t px-6 py-2 text-xs font-medium ${
              banner.type === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                {banner.type === 'error' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                )}
                {banner.message}
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-neutral-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. Split View Layout */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        {/* Left Sidebar: Synced Issues & PRs */}
        <aside className="flex w-full flex-col border-b border-neutral-800 bg-neutral-950 lg:w-[420px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Triage &amp; Bounty Queue
              </span>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
                {filteredIssues.length}
              </span>
            </div>

            <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'issue', label: 'Issues' },
                { id: 'pr', label: 'PRs' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    filterType === tab.id
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 divide-y divide-neutral-800/70 overflow-y-auto lg:max-h-[calc(100vh-115px)]">
            {loadingIssues ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Loading synced items...</span>
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No issues or PRs in queue. Enter a repository above and click{' '}
                <span className="font-medium text-neutral-300">Scan Repo</span>.
              </div>
            ) : (
              filteredIssues.map((item) => {
                const isSelected = selectedIssue?.id === item.id
                const needsRepro = Boolean(item.triage_report?.needs_repro)
                const isBreaking = Boolean(item.triage_report?.is_breaking)
                const itemBountyXlm = getRecommendedBountyXlm(item)
                const isPaid = item.bounty_status === 'paid' || Boolean(item.stellar_tx_hash)

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left transition ${
                      isSelected
                        ? 'bg-neutral-900/95 border-l-2 border-l-indigo-500 pl-3.5 pr-4 py-3.5'
                        : 'px-4 py-3.5 hover:bg-neutral-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-neutral-300">
                        {item.is_pr ? (
                          <GitPullRequest className="h-3.5 w-3.5 text-purple-400" />
                        ) : (
                          <CircleDot className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                        #{item.github_issue_id}
                      </span>
                      <span className="inline-flex items-center gap-1 text-neutral-400">
                        <User className="h-3 w-3" />@{item.author}
                      </span>
                    </div>

                    <h2 className="mt-1.5 line-clamp-2 text-sm font-medium text-neutral-100">
                      {item.title}
                    </h2>

                    {/* Triage Status + AI Recommended Stellar XLM Bounty Badges */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                        <Coins className="h-3 w-3 text-sky-400" />
                        AI Recommended Bounty: {itemBountyXlm} XLM
                      </span>

                      {isPaid && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Bounty Paid
                        </span>
                      )}

                      {needsRepro && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          Needs Repro
                        </span>
                      )}

                      {isBreaking && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                          <AlertOctagon className="h-3 w-3" />
                          Breaking Change
                        </span>
                      )}

                      {!needsRepro && !isBreaking && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Ready for Review
                        </span>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Main Panel: Selected Issue Inspection View */}
        <main className="flex-1 overflow-y-auto bg-neutral-950 p-6 lg:max-h-[calc(100vh-65px)] lg:p-8">
          {!selectedIssue ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/20 p-12 text-center">
              <Sparkles className="h-8 w-8 text-neutral-600" />
              <h2 className="mt-3 text-base font-semibold text-neutral-300">
                No Issue or Pull Request Selected
              </h2>
              <p className="mt-1 max-w-md text-xs text-neutral-500">
                Select an item from the left sidebar or scan a GitHub repository to inspect markdown descriptions, AI triage insights, and Stellar XLM bounties.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              {/* Selected Item Header */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium ${
                          selectedIssue.is_pr
                            ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        }`}
                      >
                        {selectedIssue.is_pr ? (
                          <>
                            <GitPullRequest className="h-3 w-3" />
                            Pull Request
                          </>
                        ) : (
                          <>
                            <CircleDot className="h-3 w-3" />
                            Issue
                          </>
                        )}
                      </span>
                      <span className="font-mono font-semibold text-neutral-200">
                        {selectedIssue.repository
                          ? `${selectedIssue.repository.owner}/${selectedIssue.repository.name}#${selectedIssue.github_issue_id}`
                          : `#${selectedIssue.github_issue_id}`}
                      </span>
                      <span>•</span>
                      <span>Opened by @{selectedIssue.author}</span>
                    </div>

                    <h2 className="text-xl font-bold tracking-tight text-white">
                      {selectedIssue.title}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleRunTriage(selectedIssue.id)}
                      disabled={triagingId === selectedIssue.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/25 disabled:opacity-50"
                    >
                      {triagingId === selectedIssue.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analyzing with Gemini...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Re-run AI Triage
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenBountyModal(selectedIssue)}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-500 hover:to-indigo-500"
                    >
                      <Award className="h-3.5 w-3.5" />
                      Release Stellar Bounty ({selectedBountyXlm} XLM)
                    </button>
                  </div>
                </div>
              </div>

              {/* Stellar XLM Bounty & Drips Status Banner on Issue */}
              <section className="rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-neutral-900/80 to-indigo-950/40 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          AI Recommended Bounty: {selectedBountyXlm} XLM
                        </span>
                        <span className="rounded-md border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                          {selectedComplexity} Complexity
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                            selectedIssue.bounty_status === 'paid'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {selectedIssue.bounty_status || 'escrowed'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        On-chain Memo:{' '}
                        <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-sky-300">
                          IssueLens-Bounty-#{selectedIssue.github_issue_id}
                        </code>
                        {selectedIssue.stellar_tx_hash && (
                          <>
                            {' '}
                            • Tx:{' '}
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${selectedIssue.stellar_tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-emerald-300 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-200"
                            >
                              {selectedIssue.stellar_tx_hash.slice(0, 12)}...
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenBountyModal(selectedIssue)}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {selectedIssue.bounty_status === 'paid'
                      ? 'View Stellar Receipt / Re-pay'
                      : 'Release Stellar Bounty'}
                  </button>
                </div>
              </section>

              {/* AI Triage Insights Box */}
              <section className="rounded-xl border border-indigo-500/25 bg-neutral-900/70 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold tracking-wide text-white">
                      AI Triage Insights
                    </h3>
                  </div>

                  {/* Suggested Tags + AI Recommended Bounty Badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-200">
                      <Coins className="h-3 w-3 text-sky-400" />
                      AI Recommended Bounty: {selectedBountyXlm} XLM
                    </span>
                    <Tag className="ml-1 mr-0.5 h-3.5 w-3.5 text-neutral-500" />
                    {(report?.suggested_tags?.length
                      ? report.suggested_tags
                      : ['bug', 'repro-needed']
                    ).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 font-mono text-xs font-medium text-neutral-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Summary */}
                <p className="mt-3.5 text-sm leading-relaxed text-neutral-200">
                  {report?.ai_summary ||
                    'Run AI Triage to inspect reproduction completeness, suggested labels, and breaking changes.'}
                </p>

                {/* Diagnostic Cards: Repro Gaps, Breaking Change Alert, Test Coverage Alert */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {/* Reproduction Gaps */}
                  <div
                    className={`rounded-lg border p-3 ${
                      report?.needs_repro
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-neutral-800 bg-neutral-950/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <AlertTriangle
                        className={`h-4 w-4 ${
                          report?.needs_repro ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      />
                      <span
                        className={
                          report?.needs_repro ? 'text-amber-200' : 'text-neutral-200'
                        }
                      >
                        {report?.needs_repro
                          ? 'Missing Reproduction Steps'
                          : 'Reproduction Complete'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      {report?.needs_repro
                        ? 'Missing reproduction steps, minimal code snippet, or stack trace logs.'
                        : 'Sufficient steps or verification details found in description.'}
                    </p>
                  </div>

                  {/* Breaking Change Detection */}
                  <div
                    className={`rounded-lg border p-3 ${
                      report?.is_breaking
                        ? 'border-rose-500/30 bg-rose-500/10'
                        : 'border-neutral-800 bg-neutral-950/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <ShieldAlert
                        className={`h-4 w-4 ${
                          report?.is_breaking ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      />
                      <span
                        className={
                          report?.is_breaking ? 'text-rose-200' : 'text-neutral-200'
                        }
                      >
                        {report?.is_breaking
                          ? 'Breaking Change Alert'
                          : 'No Breaking Changes'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      {report?.is_breaking
                        ? 'Public function signature or exported API endpoint modified in diff.'
                        : 'Public signatures and exported endpoints appear backward-compatible.'}
                    </p>
                  </div>

                  {/* Test Coverage Alert */}
                  <div
                    className={`rounded-lg border p-3 ${
                      selectedIssue.is_pr && !prHasTests
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-neutral-800 bg-neutral-950/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <FileCode2
                        className={`h-4 w-4 ${
                          selectedIssue.is_pr
                            ? prHasTests
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                            : 'text-neutral-400'
                        }`}
                      />
                      <span
                        className={
                          selectedIssue.is_pr && !prHasTests
                            ? 'text-amber-200'
                            : 'text-neutral-200'
                        }
                      >
                        {selectedIssue.is_pr
                          ? prHasTests
                            ? 'Unit Tests Included'
                            : 'Test Coverage Alert'
                          : 'Issue Verification'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      {selectedIssue.is_pr
                        ? prHasTests
                          ? 'Unit test files (e.g., test_*.py or *.test.tsx) detected in PR diff.'
                          : 'No unit test files (test_*.py or *.test.tsx) detected in the PR diff.'
                        : 'Standard issue report — unit test diff check applies to Pull Requests.'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Full Issue Description with Markdown Formatting */}
              <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
                <div className="mb-3 border-b border-neutral-800 pb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Description &amp; Context
                  </h3>
                </div>
                <MarkdownRenderer content={selectedIssue.body} />
              </section>

              {/* Drafted Maintainer Reply */}
              <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquareReply className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Drafted Maintainer Reply
                    </h3>
                  </div>
                  <span className="text-xs text-neutral-400">
                    Editable markdown response ready for GitHub
                  </span>
                </div>

                <textarea
                  rows={5}
                  value={draftedReply}
                  onChange={(e) => setDraftedReply(e.target.value)}
                  placeholder="AI-drafted maintainer response will appear here..."
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 p-3.5 text-sm leading-relaxed text-neutral-100 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />

                <div className="mt-3.5 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCopyReply}
                    disabled={!draftedReply.trim()}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy to Clipboard</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePostCommentToGitHub}
                    disabled={postingReply || !draftedReply.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {postingReply ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Posting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Post Comment to GitHub</span>
                      </>
                    )}
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* 3. Release Stellar Bounty Modal / Drawer */}
      {bountyModalOpen && selectedIssue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-stellar-bounty-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/15 text-sky-300">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="release-stellar-bounty-title"
                    className="text-base font-bold text-white"
                  >
                    Release Stellar Bounty
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Issue #{selectedIssue.github_issue_id} • Stellar Testnet Horizon
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBountyModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePayViaStellarHorizon} className="mt-5 space-y-4">
              {/* Complexity & Recommended Bounty Summary */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/80 p-3.5 text-xs">
                <div>
                  <span className="text-neutral-400">AI Complexity Tier:</span>{' '}
                  <span className="font-semibold text-white">
                    {selectedComplexity} ({selectedBountyXlm} XLM)
                  </span>
                </div>
                <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-sky-300">
                  Memo: IssueLens-Bounty-#{selectedIssue.github_issue_id}
                </span>
              </div>

              {/* Contributor Stellar Public Key Input */}
              <div>
                <label
                  htmlFor="contributor-stellar-address"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
                >
                  Contributor Stellar Public Key (G...)
                </label>
                <input
                  id="contributor-stellar-address"
                  type="text"
                  value={contributorAddressInput}
                  onChange={(e) => setContributorAddressInput(e.target.value)}
                  placeholder="G..."
                  required
                  className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 font-mono text-xs text-neutral-100 placeholder-neutral-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Enter the contributor&apos;s 56-character Stellar Ed25519 public key (`G...`).
                </p>
              </div>

              {/* Bounty Amount (XLM) */}
              <div>
                <label
                  htmlFor="stellar-bounty-amount"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-300"
                >
                  Bounty Amount (XLM)
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="stellar-bounty-amount"
                    type="number"
                    step="1"
                    min="1"
                    value={bountyAmountInput}
                    onChange={(e) => setBountyAmountInput(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 font-mono text-sm text-neutral-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                  />
                  {[
                    { label: 'Low (25)', value: 25 },
                    { label: 'Med (75)', value: 75 },
                    { label: 'High (150)', value: 150 },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBountyAmountInput(preset.value)}
                      className="shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs font-medium text-neutral-300 hover:border-sky-500/40 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {payoutError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {payoutError}
                </div>
              )}

              {/* Live Transaction Hash & Stellar Expert Link */}
              {payoutReceipt && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Stellar XLM Bounty Settled ({payoutReceipt.bounty_xlm} XLM)
                    </span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-200">
                      {payoutReceipt.simulated ? 'Testnet Simulation' : 'Live Testnet'}
                    </span>
                  </div>

                  <div className="space-y-1 font-mono text-[11px] text-neutral-300">
                    <div className="break-all">
                      <span className="text-neutral-500">Tx Hash:</span>{' '}
                      {payoutReceipt.stellar_tx_hash}
                    </div>
                    <div>
                      <span className="text-neutral-500">Memo:</span>{' '}
                      {payoutReceipt.memo}
                    </div>
                  </div>

                  <div className="pt-1">
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${payoutReceipt.stellar_tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                      <span>View on Stellar Expert Explorer</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBountyModalOpen(false)}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={payingBounty}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50"
                >
                  {payingBounty ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Submitting to Horizon...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="h-3.5 w-3.5" />
                      <span>Pay via Stellar Horizon</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
