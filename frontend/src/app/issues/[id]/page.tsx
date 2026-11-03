'use client'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { issuesApi, adminApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRequireAuth } from '@/hooks/useAuth'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScoreBar } from '@/components/ui/ScoreBar'
import { fmtDate, fmtRelative, severityColor, confidenceColor } from '@/lib/utils'
import {
  AlertTriangle, Clock, Users, MessageSquare, ThumbsUp, ArrowLeft,
  CheckCircle, FileText, Send, MessageCircle, Shield, ArrowRight
} from 'lucide-react'
import { Comment } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useState, useEffect } from 'react'
import { AddContextModal } from '@/components/dashboard/AddContextModal'

export default function IssueDetailPage() {
  const { id } = useParams()
  const { user } = useRequireAuth()
  const qc = useQueryClient()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)
  const [commentText, setCommentText] = useState('')

  const { data: clusterData, isLoading, isError } = useQuery({
    queryKey: ['issue-cluster', id],
    queryFn: () => issuesApi.getCluster(Number(id)).then(r => r.data),
    enabled: !!id && !!user,
  })

  const cluster = clusterData?.cluster ?? (clusterData?.id ? clusterData : null)

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ['cluster-comments', id],
    queryFn: () => issuesApi.getComments(Number(id)).then(r => r.data),
    enabled: !!id && !!user,
    refetchInterval: 10_000,
  })

  const [hasSupported, setHasSupported] = useState<boolean>(cluster?.user_supported || false)
  const [supportCount, setSupportCount] = useState<number>(cluster?.support_count || 0)
  const [isTogglingSupport, setIsTogglingSupport] = useState(false)

  useEffect(() => {
    if (cluster) {
      setHasSupported(cluster.user_supported || false)
      setSupportCount(cluster.support_count || 0)
    }
  }, [cluster])

  const { data: adminDetail } = useQuery({
    queryKey: ['admin-cluster', id],
    queryFn: () => adminApi.clusterDetail(Number(id)).then(r => r.data),
    enabled: !!id && !!user && user.role !== 'student',
  })

  const toggleSupport = async () => {
    if (isTogglingSupport) return
    setIsTogglingSupport(true)

    if (hasSupported) {
      try {
        await issuesApi.removeSupport(Number(id))
        setHasSupported(false)
        setSupportCount(c => Math.max(0, c - 1))
        toast.success('Upvote removed')
        qc.invalidateQueries({ queryKey: ['issue-cluster', id] })
      } catch {
        toast.error('Failed to retract upvote')
      } finally {
        setIsTogglingSupport(false)
      }
    } else {
      try {
        await issuesApi.support(Number(id))
        setHasSupported(true)
        setSupportCount(c => c + 1)
        toast.success('Your upvote was recorded! 🚀')
        qc.invalidateQueries({ queryKey: ['issue-cluster', id] })
      } catch {
        toast.error('Already supported or error recording upvote')
      } finally {
        setIsTogglingSupport(false)
      }
    }
  }

  const commentMut = useMutation({
    mutationFn: (content: string) => issuesApi.addComment(Number(id), content),
    onSuccess: () => {
      toast.success('Perspective shared anonymously! 💬')
      setCommentText('')
      qc.invalidateQueries({ queryKey: ['cluster-comments', id] })
      qc.invalidateQueries({ queryKey: ['issue-cluster', id] })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Failed to post comment')
    },
  })

  const feedbackMut = useMutation({
    mutationFn: (sentiment: string) => issuesApi.feedback(Number(id), { sentiment }),
    onSuccess: () => { toast.success('Feedback submitted'); setFeedbackSent(true) },
    onError: () => toast.error('Feedback submission failed'),
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center text-[#64748B]">
      Loading issue details...
    </div>
  )

  if (isError || !cluster) return (
    <div className="min-h-screen bg-[#080A0F] flex flex-col items-center justify-center p-4 text-center">
      <AlertTriangle className="text-[#FF4444] mb-3" size={32} />
      <h2 className="text-lg font-bold mb-1">Issue Topic Not Found</h2>
      <p className="text-sm text-[#64748B] mb-4">This campus topic may have been resolved, merged, or archived.</p>
      <Link href="/dashboard" className="btn-primary text-sm py-2 px-4">
        Back to Dashboard
      </Link>
    </div>
  )

  const explanation = clusterData?.explanation ?? adminDetail?.explanation
  const timeline = adminDetail?.timeline ?? []
  const slaOverdue = cluster.sla_deadline && new Date(cluster.sla_deadline) < new Date()

  return (
    <div className="min-h-screen bg-[#080A0F] text-white">
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-100 pointer-events-none" />
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">

        {/* Back and Admin Bar */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[#64748B] hover:text-white text-sm transition-colors">
            <ArrowLeft size={13} /> Back to feed
          </Link>

          {user?.role !== 'student' && (
            <Link
              href="/admin"
              className="px-2.5 py-1 rounded bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30 hover:bg-[#FFB800]/25 text-xs font-medium flex items-center gap-1.5 transition-all"
            >
              <Shield size={12} /> Admin Dashboard
            </Link>
          )}
        </div>

        {/* Admin Inspection Mode Notice */}
        {user?.role !== 'student' && (
          <div className="card p-3 mb-5 bg-[#FFB800]/10 border-[#FFB800]/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-[#FFB800] shrink-0" />
              <span className="text-xs text-[#FFB800]">
                <strong>Admin Inspection Mode:</strong> You are viewing this issue topic from the student perspective.
              </span>
            </div>
            <Link
              href="/admin"
              className="text-xs text-white hover:underline flex items-center gap-1 shrink-0"
            >
              Open in Admin Table <ArrowRight size={11} />
            </Link>
          </div>
        )}

        {/* Main Issue Card */}
        <div className="card p-6 mb-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-3">
                <StatusBadge status={cluster.status} />
                {cluster.is_escalated && (
                  <span className="badge badge-escalated flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {cluster.escalation_type === 'override' ? 'URGENT ESCALATION 🔥' : 'ESCALATED TO ADMIN ⚡'}
                  </span>
                )}
                {slaOverdue && (
                  <span className="badge bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20 flex items-center gap-1">
                    <Clock size={10} /> ACTION OVERDUE
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold leading-snug">{cluster.title}</h1>
              {cluster.summary && <p className="text-[#94A3B8] text-sm mt-2 leading-relaxed">{cluster.summary}</p>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold font-mono" style={{ color: confidenceColor(cluster.confidence_score) }}>
                {Math.round(cluster.confidence_score * 100)}%
              </div>
              <div className="text-xs text-[#64748B]">Impact Score</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <ScoreBar value={cluster.confidence_score} label="Campus Momentum" color={confidenceColor(cluster.confidence_score)} />
            <ScoreBar value={cluster.severity} label="Urgency Level" color={severityColor(cluster.severity)} />
            <ScoreBar value={cluster.diversity_score} label="Cross-Branch Reach" color="#B44FFF" />
            <ScoreBar value={cluster.scope} label="Impact Area" color="#00D4FF" />
          </div>

          <div className="flex items-center gap-6 text-sm text-[#94A3B8] mb-4">
            <span className="flex items-center gap-1.5"><MessageSquare size={13}/>{cluster.report_count} student reports</span>
            <span className="flex items-center gap-1.5"><ThumbsUp size={13}/>{supportCount} student upvotes</span>
            <span className="flex items-center gap-1.5"><Users size={13}/>{cluster.departments_involved.length} branches affected</span>
            <span className="flex items-center gap-1.5"><MessageCircle size={13}/>{comments.length} perspectives</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {cluster.departments_involved.map((d: string) => (
              <span key={d} className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C2333] text-[#94A3B8]">{d}</span>
            ))}
            {cluster.years_involved.map((y: number) => (
              <span key={y} className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C2333] text-[#94A3B8]">Year {y}</span>
            ))}
          </div>

          {cluster.sla_deadline && (
            <div className={`text-xs flex items-center gap-1.5 ${slaOverdue ? 'text-[#FF4444]' : 'text-[#64748B]'}`}>
              <Clock size={11} />Target Resolution Deadline: {fmtDate(cluster.sla_deadline)}{slaOverdue && ' — OVERDUE ⏳'}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap gap-3 pt-4 border-t border-white/[0.06]">
            <button
              onClick={toggleSupport}
              disabled={isTogglingSupport}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                hasSupported
                  ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 shadow-[0_0_12px_rgba(0,212,255,0.25)]'
                  : 'btn-ghost hover:border-[#00D4FF]/40 text-white'
              }`}
            >
              <ThumbsUp size={14} className={hasSupported ? 'fill-[#00D4FF] text-[#00D4FF]' : 'text-[#00D4FF]'} />
              <span>{hasSupported ? 'Upvoted' : 'Upvote / I Have This Issue Too'}</span>
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-black/40 text-[#94A3B8]">{supportCount}</span>
            </button>

            {user?.role === 'student' && (
              <button
                onClick={() => setShowContextModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-sm hover:border-white/40"
              >
                <FileText size={14} /> Add Proof & Details
              </button>
            )}
          </div>
        </div>

        {/* Explainability Breakdown */}
        {explanation && (
          <div className="card p-5 mb-5">
            <p className="section-label mb-4">How this issue is verified & ranked</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(explanation.reason).map(([k, v]) => (
                <div key={k} className="bg-[#1C2333] rounded-lg p-3">
                  <div className="text-xs text-[#64748B] capitalize mb-1">{k.replace('_', ' ')}</div>
                  <div className="font-mono text-sm text-white">{String(v)}</div>
                </div>
              ))}
            </div>
            {!explanation.diversity_valid && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-[#FFB800]/5 border border-[#FFB800]/20 text-xs text-[#FFB800]">
                💡 Tip: Issues need upvotes from students across at least 2 different branches to trend campus-wide and trigger administrative escalation.
              </div>
            )}
          </div>
        )}

        {/* Public Discussion & Student Perspectives (Comment Section) */}
        <div className="card p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 text-white">
                <MessageCircle size={16} className="text-[#00D4FF]" />
                Campus Discussion & Student Views
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Anonymous discussion and perspectives from NSRIT students & administration
              </p>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C2333] text-[#00D4FF]">
              {comments.length} {comments.length === 1 ? 'perspective' : 'perspectives'}
            </span>
          </div>

          {/* Comments list */}
          <div className="space-y-3 mb-5">
            {commentsLoading ? (
              <div className="space-y-2">
                <div className="h-14 bg-[#1C2333] rounded animate-pulse" />
                <div className="h-14 bg-[#1C2333] rounded animate-pulse" />
              </div>
            ) : comments.length === 0 ? (
              <div className="p-5 rounded-lg bg-[#1C2333]/40 border border-white/[0.04] text-center">
                <MessageSquare size={24} className="mx-auto mb-2 text-[#64748B] opacity-50" />
                <p className="text-xs font-medium text-[#94A3B8]">No student perspectives shared yet</p>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Have you experienced this issue? Share your anonymous view or extra details below.
                </p>
              </div>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-3.5 rounded-lg bg-[#1C2333]/50 border border-white/[0.06] hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {c.author_role === 'student' ? (
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 font-medium">
                          🎓 {c.author_department || 'Student'} · Year {c.author_year || 1}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30 font-medium flex items-center gap-1">
                          <Shield size={10} /> Official Admin Response
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#64748B]">{fmtRelative(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Comment input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!commentText.trim() || commentMut.isPending) return
              commentMut.mutate(commentText.trim())
            }}
            className="pt-4 border-t border-white/[0.06]"
          >
            <label className="block text-xs text-[#94A3B8] font-medium mb-1.5">
              Add your perspective anonymously:
            </label>
            <div className="relative">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your experience, specific details (room number, lab, block), or updates on this problem..."
                rows={3}
                maxLength={1000}
                className="input w-full text-xs p-3 resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-[#64748B]">
                  Posting anonymously as{' '}
                  {user?.role === 'student'
                    ? `${user?.department} (Year ${user?.academic_year})`
                    : 'College Administration'}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#64748B] font-mono">
                    {commentText.length}/1000
                  </span>
                  <button
                    type="submit"
                    disabled={commentText.trim().length < 2 || commentMut.isPending}
                    className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Send size={12} />
                    {commentMut.isPending ? 'Posting…' : 'Share View'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Timeline updates */}
        {timeline.length > 0 && (
          <div className="card p-5 mb-5">
            <p className="section-label mb-4">Issue activity & updates</p>
            <div className="space-y-3">
              {timeline.map((e: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#00D4FF] mt-1.5 shrink-0" />
                  <div>
                    <div className="font-mono text-xs text-[#00D4FF]">{e.event_type}</div>
                    <div className="text-xs text-[#64748B] mt-0.5">{fmtDate(e.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Post-resolution feedback */}
        {!feedbackSent && cluster.status === 'resolved' && user?.role === 'student' && (
          <div className="card p-5">
            <p className="section-label mb-3">Did the college fix this problem?</p>
            <div className="flex gap-3">
              {[
                { key: 'resolved', label: 'Yes, Fixed! 🎉' },
                { key: 'partial', label: 'Partially ⚠️' },
                { key: 'unresolved', label: 'Still Unresolved ❌' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => feedbackMut.mutate(key)}
                  className="btn-ghost text-sm flex-1 hover:border-[#00D4FF]/40">{label}</button>
              ))}
            </div>
          </div>
        )}

        {feedbackSent && (
          <div className="card p-4 flex items-center gap-2 text-[#00FF88] text-sm">
            <CheckCircle size={14} /> Feedback recorded. Thank you.
          </div>
        )}

        {showContextModal && (
          <AddContextModal
            issueId={Number(id)}
            onClose={() => setShowContextModal(false)}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['issue-cluster', id] })}
          />
        )}
      </div>
    </div>
  )
}
