'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, Plus, LogOut, TrendingUp, Zap, Clock, BarChart3,
  Settings, User as UserIcon, Search, X, Layers, FileText, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { useRequireAuth, useAutoRefresh } from '@/hooks/useAuth'
import { issuesApi } from '@/lib/api'
import { ClusterCard } from '@/components/dashboard/ClusterCard'
import { SubmitModal } from '@/components/dashboard/SubmitModal'
import { ProfileModal } from '@/components/dashboard/ProfileModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtDate } from '@/lib/utils'
import { Cluster, Issue } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const FEEDS = [
  { key: undefined,  label: 'All Activity' },
  { key: 'new',      label: 'New' },
  { key: 'active',   label: 'Active' },
  { key: 'trending', label: 'Trending' },
]

const CATEGORIES = [
  'all',
  'infrastructure',
  'academics',
  'administration',
  'safety',
  'transport',
  'sports',
]

export default function DashboardPage() {
  useAutoRefresh()
  const { user } = useRequireAuth()
  const { logout } = useAuthStore()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'feed' | 'my_submissions'>('feed')
  const [feed, setFeed] = useState<string | undefined>(undefined)
  const [category, setCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Redirect admins to admin dashboard
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      router.push('/admin')
    }
  }, [user, router])

  // Campus clusters query
  const { data: clusterData, isLoading: clustersLoading, refetch: refetchClusters } = useQuery({
    queryKey: ['clusters', feed, category, searchTerm],
    queryFn: () => issuesApi.listClusters({
      feed_type: feed,
      category: category === 'all' ? undefined : category,
      search: searchTerm.trim() || undefined,
      page_size: 30,
    }).then(r => r.data),
    enabled: !!user && activeTab === 'feed',
  })

  // Student's own submissions query
  const { data: myIssuesData, isLoading: myIssuesLoading, refetch: refetchMyIssues } = useQuery({
    queryKey: ['my-issues'],
    queryFn: () => issuesApi.myIssues({ page_size: 50 }).then(r => r.data),
    enabled: !!user && activeTab === 'my_submissions',
  })

  const clusters: Cluster[] = clusterData?.items ?? []
  const myIssues: Issue[] = myIssuesData?.items ?? []

  return (
    <div className="min-h-screen bg-[#080A0F] text-white">
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-100 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 sticky top-0 bg-[#080A0F]/90 backdrop-blur border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={16} className="text-[#00D4FF]" />
            <span className="font-bold tracking-tight">AnonCampus</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-[#64748B] hidden sm:block">
              {user?.department} · Year {user?.academic_year}
            </div>
            <div className="text-xs font-mono px-2 py-1 rounded bg-[#1C2333] text-[#94A3B8]">
              Trust: {user?.trust_score?.toFixed(2) ?? '1.00'}
            </div>
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <Link href="/admin" className="text-[#FFB800] hover:text-[#FFB800]/80 transition-colors" title="Admin Portal">
                <Settings size={15} />
              </Link>
            )}
            <button
              onClick={() => setShowProfileModal(true)}
              className="text-[#64748B] hover:text-[#00D4FF] transition-colors"
              title="Profile & Security Settings"
            >
              <UserIcon size={16} />
            </button>
            <button
              onClick={logout}
              className="text-[#64748B] hover:text-[#FF4444] transition-colors"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Grievance Portal</h1>
            <p className="text-[#64748B] text-sm mt-1">
              Anonymous corroboration & collective voice for campus issues
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Plus size={15} /> Submit Issue
          </button>
        </div>

        {/* View Switcher (Feed vs My Submissions) */}
        <div className="flex items-center gap-4 border-b border-white/[0.08] mb-6">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'feed'
                ? 'text-[#00D4FF] border-[#00D4FF]'
                : 'text-[#64748B] border-transparent hover:text-white'
            }`}
          >
            <Layers size={15} /> Campus Issues
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#1C2333] text-[#94A3B8]">
              {clusterData?.total ?? clusters.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('my_submissions')}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'my_submissions'
                ? 'text-[#00D4FF] border-[#00D4FF]'
                : 'text-[#64748B] border-transparent hover:text-white'
            }`}
          >
            <FileText size={15} /> My Submissions
            {myIssuesData && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#1C2333] text-[#94A3B8]">
                {myIssuesData.total}
              </span>
            )}
          </button>
        </div>

        {/* Main Feed Tab View */}
        {activeTab === 'feed' && (
          <div>
            {/* Search and Filters Bar */}
            <div className="space-y-4 mb-6">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search issues by title, location, or keyword…"
                  className="input pl-10 pr-9 w-full text-sm py-2"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status and Category Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Activity Feed tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {FEEDS.map(({ key, label }) => (
                    <button
                      key={label}
                      onClick={() => setFeed(key)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        feed === key
                          ? 'bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/30'
                          : 'text-[#64748B] hover:text-white border border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono capitalize whitespace-nowrap transition-all ${
                        category === cat
                          ? 'bg-white/10 text-white font-medium border border-white/20'
                          : 'text-[#64748B] hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clusters Grid */}
            {clustersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="card p-5 h-48 animate-pulse">
                    <div className="h-4 bg-[#1C2333] rounded w-3/4 mb-3" />
                    <div className="h-3 bg-[#1C2333] rounded w-1/2 mb-4" />
                    <div className="h-1.5 bg-[#1C2333] rounded mb-2" />
                    <div className="h-1.5 bg-[#1C2333] rounded w-4/5" />
                  </div>
                ))}
              </div>
            ) : clusters.length === 0 ? (
              <div className="text-center py-20 text-[#475569] card p-10">
                <Shield size={36} className="mx-auto mb-3 opacity-30 text-[#00D4FF]" />
                <p className="font-semibold text-[#94A3B8] text-base">No matching issues found</p>
                <p className="text-sm text-[#64748B] mt-1">
                  {searchTerm || category !== 'all' || feed
                    ? 'Try adjusting your search query or filter criteria.'
                    : 'Be the first to submit a grievance anonymously.'}
                </p>
                {(searchTerm || category !== 'all' || feed) ? (
                  <button
                    onClick={() => { setSearchTerm(''); setCategory('all'); setFeed(undefined) }}
                    className="mt-4 text-xs text-[#00D4FF] hover:underline"
                  >
                    Clear all filters
                  </button>
                ) : (
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 btn-primary text-sm px-4 py-2"
                  >
                    Submit First Issue
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clusters.map((c) => (
                  <ClusterCard key={c.id} cluster={c} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Submissions Tab View */}
        {activeTab === 'my_submissions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#64748B] mb-2">
              <span>Your anonymous submission history at NSRIT</span>
              <span>Total: {myIssues.length} issues</span>
            </div>

            {myIssuesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card p-5 h-24 animate-pulse" />
                ))}
              </div>
            ) : myIssues.length === 0 ? (
              <div className="card p-12 text-center text-[#64748B]">
                <FileText size={32} className="mx-auto mb-3 opacity-30 text-[#00D4FF]" />
                <h3 className="text-base font-semibold text-[#94A3B8] mb-1">
                  No issues submitted yet
                </h3>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto mb-4">
                  Issues you submit anonymously will appear here so you can track resolution status and cluster updates.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                >
                  <Plus size={14} /> Submit New Issue
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myIssues.map((issue) => (
                  <div key={issue.id} className="card p-5 hover:border-white/20 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={issue.status} />
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C2333] text-[#94A3B8] capitalize">
                          {issue.category}
                        </span>
                        <span className="text-xs text-[#64748B]">
                          Submitted {fmtDate(issue.created_at)}
                        </span>
                      </div>

                      {issue.cluster_id && (
                        <Link
                          href={`/issues/${issue.cluster_id}`}
                          className="inline-flex items-center gap-1 text-xs text-[#00D4FF] hover:underline"
                        >
                          View Cluster Activity <ArrowRight size={12} />
                        </Link>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-white mb-1.5">{issue.title}</h3>
                    {issue.body && (
                      <p className="text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">
                        {issue.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <SubmitModal
          onClose={() => {
            setShowModal(false)
            refetchClusters()
            refetchMyIssues()
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}
    </div>
  )
}
