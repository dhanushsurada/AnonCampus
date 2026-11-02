'use client'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { issuesApi, adminApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRequireAuth } from '@/hooks/useAuth'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScoreBar } from '@/components/ui/ScoreBar'
import { fmtDate, severityColor, confidenceColor } from '@/lib/utils'
import { AlertTriangle, Clock, Users, MessageSquare, ThumbsUp, ArrowLeft, CheckCircle, FileText } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { AddContextModal } from '@/components/dashboard/AddContextModal'

export default function IssueDetailPage() {
  const { id } = useParams()
  const { user } = useRequireAuth()
  const qc = useQueryClient()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)

  const { data: clusterData, isLoading, isError } = useQuery({
    queryKey: ['issue-cluster', id],
    queryFn: () => issuesApi.getCluster(Number(id)).then(r => r.data),
    enabled: !!id && !!user,
  })

  const cluster = clusterData?.cluster ?? (clusterData?.id ? clusterData : null)

  const { data: adminDetail } = useQuery({
    queryKey: ['admin-cluster', id],
    queryFn: () => adminApi.clusterDetail(Number(id)).then(r => r.data),
    enabled: !!id && !!user && user.role !== 'student',
  })

  const supportMut = useMutation({
    mutationFn: () => issuesApi.support(Number(id)),
    onSuccess: () => { toast.success('Support recorded'); qc.invalidateQueries({ queryKey: ['issue-cluster', id] }) },
    onError: () => toast.error('Already supported or issue not found'),
  })

  const feedbackMut = useMutation({
    mutationFn: (sentiment: string) => issuesApi.feedback(Number(id), { sentiment }),
    onSuccess: () => { toast.success('Feedback submitted'); setFeedbackSent(true) },
    onError: () => toast.error('Feedback submission failed'),
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center text-[#64748B]">
      Loading cluster details...
    </div>
  )

  if (isError || !cluster) return (
    <div className="min-h-screen bg-[#080A0F] flex flex-col items-center justify-center p-4 text-center">
      <AlertTriangle className="text-[#FF4444] mb-3" size={32} />
      <h2 className="text-lg font-bold mb-1">Issue Cluster Not Found</h2>
      <p className="text-sm text-[#64748B] mb-4">This cluster may have been merged or removed.</p>
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

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[#64748B] hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={13} /> Back to feed
        </Link>

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
            <span className="flex items-center gap-1.5"><ThumbsUp size={13}/>{cluster.support_count} student upvotes</span>
            <span className="flex items-center gap-1.5"><Users size={13}/>{cluster.departments_involved.length} branches affected</span>
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

          {user?.role === 'student' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => supportMut.mutate()} disabled={supportMut.isPending}
                className="btn-ghost flex items-center gap-1.5 text-sm hover:border-[#00D4FF]/40">
                <ThumbsUp size={13} className="text-[#00D4FF]" /> Upvote / I Have This Issue Too
              </button>
              <button onClick={() => setShowContextModal(true)}
                className="btn-ghost flex items-center gap-1.5 text-sm hover:border-white/40">
                <FileText size={13} /> Add Proof & Details
              </button>
            </div>
          )}
        </div>

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
