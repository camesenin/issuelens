import React, { useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  CircleDot,
  Loader2,
  PenLine,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer.jsx'
import { COMPLEXITY_TIERS } from '../data/demoIssues.js'
import {
  getIssueStatusBadges,
  getReadinessScore,
  getRepoSlug,
  hasUnitTestsInIssue,
  truncateTxHash,
} from '../utils/triageUtils.js'

function StellarIcon({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3.5 15.5L20.5 6.5M3.5 17.5L20.5 8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function TriageModal({
  selectedIssue,
  triagingId,
  onRunTriage,
  selectedTierPts,
  setSelectedTierPts,
  contributorAddressInput,
  setContributorAddressInput,
  payingBounty,
  payoutReceipt,
  payoutError,
  onReleaseBountyViaHorizon,
  copiedTx,
  onCopyTxHash,
  draftedReply,
  setDraftedReply,
  copied,
  onCopyReply,
  postingReply,
  onPostCommentToGitHub,
}) {
  const [composerTab, setComposerTab] = useState('write') // 'write' | 'preview'

  if (!selectedIssue) {
    return (
      <aside
        aria-label="Issue inspector panel"
        className="col-span-7 overflow-y-auto bg-[#0B0C12] p-6 space-y-5 flex items-center justify-center"
      >
        <div className="text-center space-y-2">
          <Sparkles className="mx-auto h-6 w-6 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-300">
            Select an issue from the queue to inspect AI triage &amp; Stellar bounty details
          </p>
        </div>
      </aside>
    )
  }

  const badgesInfo = getIssueStatusBadges(selectedIssue)
  const readiness = getReadinessScore(selectedIssue)
  const repoSlug = getRepoSlug(selectedIssue)
  const hasTests = hasUnitTestsInIssue(selectedIssue)
  const isBreaking = Boolean(selectedIssue.triage_report?.is_breaking)
  const isSettled =
    selectedIssue.bounty_status === 'paid' ||
    Boolean(selectedIssue.stellar_tx_hash) ||
    Boolean(payoutReceipt)
  const activeTxHash = payoutReceipt?.stellar_tx_hash || selectedIssue.stellar_tx_hash

  const githubUrl = `https://github.com/${repoSlug}/${
    selectedIssue.is_pr ? 'pull' : 'issues'
  }/${selectedIssue.github_issue_id}`

  const totalSegments = 10
  const filledSegments = Math.max(1, Math.round((readiness / 100) * totalSegments))

  const segmentColor =
    readiness >= 80
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
      : readiness >= 55
        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.35)]'
        : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.35)]'

  const readinessBadgeClass =
    readiness >= 80
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : readiness >= 55
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-300'

  return (
    <aside
      aria-label="Issue inspector panel"
      className="col-span-7 overflow-y-auto bg-[#0B0C12] p-6 space-y-5 min-w-0"
    >
      {/* Inspector Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-zinc-900/50 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#090A0F] px-2 py-1 font-mono font-semibold text-zinc-100">
            {selectedIssue.is_pr ? (
              <GitPullRequest className="h-3.5 w-3.5 text-purple-400" />
            ) : (
              <CircleDot className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>#{selectedIssue.github_issue_id}</span>
          </span>

          <span className="rounded-md border border-white/[0.07] bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-300">
            {selectedIssue.is_pr ? 'PULL REQUEST' : 'ISSUE'}
          </span>

          <span className="truncate font-mono text-xs text-zinc-400">
            {repoSlug}
          </span>

          <span className="text-zinc-600">·</span>

          <span className="font-mono text-xs text-zinc-400">
            @{selectedIssue.author}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onRunTriage(selectedIssue.id)}
            disabled={triagingId === selectedIssue.id}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:text-white disabled:opacity-50"
          >
            {triagingId === selectedIssue.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
            )}
            <span>Re-Triage</span>
          </button>

          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/90 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/[0.18] hover:text-white"
          >
            <span>View on GitHub</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
          </a>
        </div>
      </div>

      {/* 1. Issue Title & Visual AI Readiness Meter Card */}
      <section className="rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 space-y-4">
        <div className="space-y-2">
          <h1 className="text-base font-semibold leading-snug text-zinc-100">
            {selectedIssue.title}
          </h1>

          {/* Semantic Tag Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {badgesInfo.badges.map((badge) => (
              <span
                key={badge.id}
                className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
            {(selectedIssue.triage_report?.suggested_tags || [])
              .filter(
                (t) =>
                  !badgesInfo.badges.some((b) => b.label === t) &&
                  !['needs-repro', 'missing-tests', 'ready', 'breaking-api'].includes(t)
              )
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-flex shrink-0 items-center rounded-md border border-white/[0.08] bg-[#090A0F] px-2 py-0.5 font-mono text-[11px] text-zinc-400"
                >
                  {tag}
                </span>
              ))}
          </div>
        </div>

        {/* Visual Segmented AI Readiness Meter */}
        <div className="rounded-xl border border-white/[0.07] bg-[#090A0F]/90 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  AI Readiness Meter
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Measures reproduction clarity, automated test coverage, and API scope safety.
              </p>
            </div>

            <span
              className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums ${readinessBadgeClass}`}
            >
              AI Readiness {readiness}/100
            </span>
          </div>

          {/* 10-Segment Progress Bar */}
          <div
            className="grid grid-cols-10 gap-1.5 pt-0.5"
            role="progressbar"
            aria-valuenow={readiness}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI Readiness Score"
          >
            {Array.from({ length: totalSegments }).map((_, idx) => {
              const active = idx < filledSegments
              return (
                <div
                  key={idx}
                  className={`h-2 rounded-sm transition-all duration-300 ${
                    active ? segmentColor : 'bg-zinc-800/90'
                  }`}
                />
              )
            })}
          </div>

          {/* Breakdown Diagnostic Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] ${
                badgesInfo.needsRepro
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {badgesInfo.needsRepro ? (
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
              )}
              <span>
                Repro Steps: {badgesInfo.needsRepro ? 'Missing' : 'Verified'}
              </span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] ${
                isBreaking
                  ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {isBreaking ? (
                <ShieldAlert className="h-3 w-3 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
              )}
              <span>Breaking Risk: {isBreaking ? 'High' : 'Low'}</span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] ${
                badgesInfo.missingTests || !hasTests
                  ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <FileCode2 className="h-3 w-3 shrink-0" />
              <span>
                Tests: {badgesInfo.missingTests || !hasTests ? 'Missing' : 'Included'}
              </span>
            </span>
          </div>
        </div>

        {/* AI Triage Executive Summary */}
        <div className="border-t border-white/[0.06] pt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Gemini Diagnostic Summary
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            <MarkdownRenderer
              content={
                selectedIssue.triage_report?.ai_summary ||
                'Automated triage complete. Inspect reproduction status and test coverage signals below.'
              }
            />
          </div>
        </div>
      </section>

      {/* 2. Stellar Bounty Settlement Card (Premium Web3 Surface) */}
      <section className="bg-gradient-to-b from-emerald-950/20 to-zinc-900/40 border border-emerald-500/20 rounded-xl p-5 space-y-4 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/15 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Terminal className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-100">
                Stellar Bounty Settlement
              </h2>
              <p className="text-[11px] text-zinc-400">
                Instant Soroban / Horizon Testnet XLM disbursement for verified fixes
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${
              isSettled
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                : 'border-emerald-500/25 bg-[#090A0F]/80 text-emerald-400'
            }`}
          >
            {isSettled ? 'Settled on Horizon' : 'Escrowed · Ready'}
          </span>
        </div>

        <form onSubmit={onReleaseBountyViaHorizon} className="space-y-4">
          {/* Complexity Tier Selector Cards */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">
                Select Complexity &amp; Bounty Tier
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-300">
                {selectedTierPts} pts / {selectedTierPts} XLM
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {COMPLEXITY_TIERS.map((tier) => {
                const active = Number(selectedTierPts) === tier.pts
                return (
                  <button
                    key={tier.pts}
                    type="button"
                    onClick={() => setSelectedTierPts(tier.pts)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-emerald-400/70 bg-emerald-500/15 text-white ring-2 ring-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'border-white/[0.08] bg-[#090A0F]/80 text-zinc-400 hover:border-emerald-500/30 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="font-mono text-xs font-semibold text-zinc-100">
                        {tier.pts} pts / {tier.xlm} XLM
                      </span>
                      {active && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </div>
                    <span className="mt-1 text-[11px] text-zinc-400">
                      {tier.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Contributor Stellar Public Key Input */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs">
              <label
                htmlFor="inspector-stellar-wallet"
                className="font-medium text-zinc-300"
              >
                Contributor Stellar Public Key (Ed25519)
              </label>
              <span className="font-mono text-[11px] text-emerald-300/80">
                Memo: IssueLens-Bounty-#{selectedIssue.github_issue_id}
              </span>
            </div>
            <input
              id="inspector-stellar-wallet"
              type="text"
              value={contributorAddressInput}
              onChange={(e) => setContributorAddressInput(e.target.value)}
              placeholder="G..."
              className="w-full rounded-lg border border-white/[0.1] bg-[#090A0F] px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 transition focus:border-emerald-400/60 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
          </div>

          {payoutError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {payoutError}
            </div>
          )}

          {/* High-Contrast Tactile Primary CTA with Stellar Icon */}
          <button
            type="submit"
            disabled={payingBounty}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/40 bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-300 px-4 py-2.5 text-xs font-semibold text-zinc-950 shadow-[0_0_25px_rgba(16,185,129,0.28)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
          >
            {payingBounty ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
                <span>Submitting Transaction to Horizon Testnet...</span>
              </>
            ) : (
              <>
                <StellarIcon className="h-4 w-4 text-zinc-950" />
                <span>
                  Release Bounty via Horizon ({selectedTierPts} XLM)
                </span>
              </>
            )}
          </button>

          {/* On-Chain Settlement Receipt */}
          {activeTxHash && (
            <div className="rounded-xl border border-emerald-500/30 bg-[#090A0F]/90 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Confirmed on Stellar Testnet</span>
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-300">
                  {payoutReceipt?.bounty_xlm || selectedTierPts} XLM Paid
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-zinc-900/80 px-2.5 py-1.5">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${activeTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-zinc-200 underline decoration-emerald-500/50 underline-offset-2 hover:text-white"
                  title={activeTxHash}
                >
                  <span className="truncate">
                    TX: {truncateTxHash(activeTxHash)}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-emerald-400" />
                </a>

                <button
                  type="button"
                  onClick={() => onCopyTxHash(activeTxHash)}
                  className="shrink-0 rounded border border-white/[0.08] bg-[#090A0F] px-2 py-0.5 font-mono text-[10px] text-zinc-300 transition hover:border-white/[0.2] hover:text-white"
                >
                  {copiedTx ? 'Copied!' : 'Copy Hash'}
                </button>
              </div>
            </div>
          )}
        </form>
      </section>

      {/* 3. Maintainer Auto-Reply Editor (GitHub Comment Composer Style) */}
      <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-900/40">
        {/* Composer Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-zinc-900/80 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Maintainer Auto-Reply
            </span>

            {/* Write / Preview Toggle */}
            <div className="inline-flex rounded-lg border border-white/[0.07] bg-[#090A0F] p-0.5">
              <button
                type="button"
                onClick={() => setComposerTab('write')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  composerTab === 'write'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <PenLine className="h-3 w-3" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setComposerTab('preview')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  composerTab === 'preview'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Eye className="h-3 w-3" />
                <span>Preview</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onRunTriage(selectedIssue.id)}
              disabled={triagingId === selectedIssue.id}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {triagingId === selectedIssue.id ? (
                <Loader2 className="h-3 w-3 animate-spin text-indigo-300" />
              ) : (
                <Sparkles className="h-3 w-3 text-indigo-300" />
              )}
              <span>Regenerate with Gemini</span>
            </button>

            <button
              type="button"
              onClick={onCopyReply}
              disabled={!draftedReply.trim()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                copied
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/[0.08] bg-[#090A0F] text-zinc-200 hover:border-white/[0.18] hover:text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span>Copied!</span>
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
              onClick={onPostCommentToGitHub}
              disabled={postingReply || !draftedReply.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-white disabled:opacity-50"
            >
              {postingReply ? (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-900" />
              ) : (
                <Send className="h-3 w-3 text-zinc-900" />
              )}
              <span>Post Reply</span>
            </button>
          </div>
        </div>

        {/* Composer Body */}
        <div className="p-4">
          {composerTab === 'write' ? (
            <textarea
              rows={5}
              value={draftedReply}
              onChange={(e) => setDraftedReply(e.target.value)}
              placeholder="AI-drafted maintainer response..."
              className="w-full rounded-lg border border-white/[0.08] bg-[#090A0F] p-3 font-mono text-xs leading-relaxed text-zinc-100 placeholder-zinc-600 transition focus:border-indigo-500/50 focus:outline-none"
            />
          ) : (
            <div className="min-h-[124px] rounded-lg border border-white/[0.07] bg-[#090A0F] p-3.5">
              <MarkdownRenderer content={draftedReply} />
            </div>
          )}
        </div>
      </section>

      {/* 4. Issue Payload & Diff Viewer */}
      <section className="rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Issue Payload &amp; Diff Viewer
          </span>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            {isBreaking && (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                <ShieldAlert className="h-3 w-3" />
                breaking-sig
              </span>
            )}
            {selectedIssue.is_pr && (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                  hasTests
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                }`}
              >
                <FileCode2 className="h-3 w-3" />
                {hasTests ? 'tests-detected' : 'no-test-diff'}
              </span>
            )}
          </div>
        </div>

        <MarkdownRenderer content={selectedIssue.body} />
      </section>
    </aside>
  )
}
