import { useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
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
} from 'lucide-react'
import MarkdownRenderer from './components/MarkdownRenderer.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function hasUnitTestsInIssue(issue) {
  const diffSource = `${issue?.diff || ''}\n${issue?.body || ''}`
  return /(?:test_[\w.-]+\.py|[\w.-]+_test\.py|[\w.-]+\.(?:test|spec)\.(?:tsx|ts|jsx|js)|\/__tests__\/|\/tests?\/)/i.test(
    diffSource
  )
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

  useEffect(() => {
    fetchIssues(true)
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
    } else {
      setDraftedReply('')
    }
  }, [selectedIssue?.id, selectedIssue?.triage_report?.drafted_reply])

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
          item.id === issueId ? { ...item, triage_report: report } : item
        )
      )
      setDraftedReply(report.drafted_reply || '')
      setBanner({
        type: 'success',
        message: `AI Triage completed for #${selectedIssue?.github_issue_id || issueId}.`,
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

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-800/90 bg-neutral-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          {/* Brand Title & Clean Badge */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-indigo-400 shadow-inner">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-white">
                IssueLens
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-indigo-300">
                AI Triage
              </span>
            </div>
          </div>

          {/* Repo Scanner Input & Button */}
          <form
            onSubmit={handleScanRepository}
            className="flex w-full max-w-lg items-center gap-2.5 sm:w-auto"
          >
            <div className="relative flex-1 sm:w-72">
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
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Terminal className="h-4 w-4" />
                  <span>Scan Repository</span>
                </>
              )}
            </button>
          </form>
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
        <aside className="flex w-full flex-col border-b border-neutral-800 bg-neutral-950 lg:w-[400px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Triage Queue
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
                <span className="font-medium text-neutral-300">Scan Repository</span>.
              </div>
            ) : (
              filteredIssues.map((item) => {
                const isSelected = selectedIssue?.id === item.id
                const needsRepro = Boolean(item.triage_report?.needs_repro)
                const isBreaking = Boolean(item.triage_report?.is_breaking)

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

                    {/* Warning & Alert Badges */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
                Select an item from the left sidebar or scan a GitHub repository to inspect markdown descriptions, AI triage insights, and maintainer replies.
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
                </div>
              </div>

              {/* AI Triage Insights Box */}
              <section className="rounded-xl border border-indigo-500/25 bg-neutral-900/70 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold tracking-wide text-white">
                      AI Triage Insights
                    </h3>
                  </div>

                  {/* Suggested Tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag className="mr-1 h-3.5 w-3.5 text-neutral-500" />
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
    </div>
  )
}
