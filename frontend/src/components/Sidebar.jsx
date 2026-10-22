import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FolderGit2,
  Inbox,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { truncateStellarAddress } from '../utils/triageUtils.js'

function BrandLogoMark() {
  return (
    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-400/30 bg-gradient-to-br from-indigo-500/25 via-purple-500/20 to-cyan-500/25 shadow-[0_0_16px_rgba(99,102,241,0.28)]">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-4 w-4 text-indigo-200"
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
          strokeWidth="1.15"
          strokeOpacity="0.65"
        />
      </svg>
    </div>
  )
}

const REPO_PRESETS = [
  { id: 'all', label: 'All Synced Repos', slug: 'all' },
  {
    id: 'stellar/stellar-soroban-env',
    label: 'stellar/soroban-env',
    slug: 'stellar/stellar-soroban-env',
  },
  {
    id: 'fastapi/fastapi',
    label: 'fastapi/fastapi',
    slug: 'fastapi/fastapi',
  },
]

export default function Sidebar({
  repoInput,
  setRepoInput,
  selectedRepoFilter,
  onSelectRepoFilter,
  onSyncRepository,
  scanning,
  activeView,
  setActiveView,
  metrics,
  networkStatus,
  walletAddress,
  onConnectWallet,
}) {
  const sidebarViews = [
    {
      id: 'all',
      label: 'All Issues',
      count: metrics.totalTriaged,
      icon: Inbox,
      iconColor: 'text-indigo-400',
      pillClass: 'bg-zinc-800/90 text-zinc-200 border-white/[0.08]',
    },
    {
      id: 'needs-repro',
      label: 'Needs Repro',
      count: metrics.needsReproCount,
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      pillClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    },
    {
      id: 'ready',
      label: 'Ready for Bounty',
      count: metrics.readyCount,
      icon: Sparkles,
      iconColor: 'text-cyan-400',
      pillClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    },
    {
      id: 'settled',
      label: 'Settled on Stellar',
      count: metrics.settledCount,
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      pillClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    },
  ]

  return (
    <aside className="w-64 shrink-0 border-r border-white/[0.07] bg-[#0C0D14] flex flex-col justify-between select-none">
      <div className="flex flex-col min-h-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogoMark />
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-zinc-100">
                IssueLens
              </span>
              <span className="block truncate text-[10px] text-zinc-500">
                AI Triage &amp; Stellar Escrow
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-white/[0.08] bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-300">
            v2.4
          </span>
        </div>

        {/* Repository Sync Card */}
        <div className="p-3">
          <div className="bg-zinc-900/60 border border-white/[0.07] rounded-xl p-3 space-y-2.5 shadow-inner">
            <div className="flex items-center justify-between">
              <label
                htmlFor="sidebar-repo-switcher"
                className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300"
              >
                <FolderGit2 className="h-3.5 w-3.5 text-indigo-400" />
                <span>Repository Sync</span>
              </label>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                GitHub API
              </span>
            </div>

            <form onSubmit={onSyncRepository} className="space-y-2">
              <div className="relative">
                <input
                  id="sidebar-repo-switcher"
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="owner/repo"
                  aria-label="Repository switcher owner/repo"
                  className="w-full rounded-lg border border-white/[0.08] bg-[#090A0F] px-2.5 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-600 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>

              <button
                type="submit"
                disabled={scanning}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-200 transition hover:border-indigo-400/50 hover:bg-indigo-500/25 hover:text-white disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300" />
                    <span>Syncing GitHub...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 text-indigo-300" />
                    <span>Sync Repository</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick-Select Preset Chips */}
            <div className="pt-1 border-t border-white/[0.06]">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-500">
                <span>Quick Repo Filter</span>
                <span className="font-mono text-[10px] text-zinc-400">1-click</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REPO_PRESETS.map((preset) => {
                  const isActive = selectedRepoFilter === preset.slug
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectRepoFilter(preset.slug)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                        isActive
                          ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200 font-medium shadow-sm'
                          : 'border-white/[0.06] bg-[#090A0F]/70 text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                      }`}
                    >
                      {preset.id === 'all' && <Layers className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{preset.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Triage Views Navigation */}
        <div className="px-3 py-1">
          <div className="mb-1.5 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Triage Views</span>
            <span className="font-mono text-[10px] text-zinc-600">Queue</span>
          </div>
          <nav className="space-y-1" aria-label="Issue filter views">
            {sidebarViews.map((view) => {
              const Icon = view.icon
              const isActive = activeView === view.id
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-r-lg px-2.5 py-2 text-xs transition ${
                    isActive
                      ? 'border-l-2 border-indigo-400 bg-white/[0.05] text-white font-medium'
                      : 'border-l-2 border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? view.iconColor : 'text-zinc-500'
                      }`}
                    />
                    <span className="truncate">{view.label}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${view.pillClass}`}
                  >
                    {view.count}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Footer Network Telemetry Widget */}
      <div className="border-t border-white/[0.07] bg-[#090A0F]/90 p-3">
        <div className="rounded-xl border border-white/[0.07] bg-zinc-900/50 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="truncate text-[11px] font-medium text-zinc-200">
                Stellar Testnet (Soroban RPC)
              </span>
            </div>
            <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
              v{networkStatus.current_protocol_version || 21}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.05] pt-1.5 font-mono text-[10px] text-zinc-400">
            <span>Horizon Ledger</span>
            <span className="tabular-nums text-zinc-200">
              #{networkStatus.history_latest_ledger || 1489210}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.05] pt-1.5 text-[10px]">
            <span className="flex items-center gap-1 text-zinc-400">
              <Wallet className="h-3 w-3 text-zinc-500" />
              <span>Freighter</span>
            </span>
            {walletAddress ? (
              <span className="font-mono text-emerald-300">
                {truncateStellarAddress(walletAddress)}
              </span>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="font-mono text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
