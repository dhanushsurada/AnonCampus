'use client'
import { useState } from 'react'
import { Cluster } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScoreBar } from '@/components/ui/ScoreBar'
import { fmtRelative, severityColor, confidenceColor } from '@/lib/utils'
import { AlertTriangle, Users, MessageSquare, ThumbsUp, Clock, Flame, MessageCircle } from 'lucide-react'
import { issuesApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Link from 'next/link'

export function ClusterCard({ cluster }: { cluster: Cluster }) {
  const qc = useQueryClient()
  const [hasSupported, setHasSupported] = useState(cluster.user_supported || false)
  const [votes, setVotes] = useState(cluster.support_count)
  const [isVoting, setIsVoting] = useState(false)

  const slaOverdue = cluster.sla_deadline && new Date(cluster.sla_deadline) < new Date()
  const momentumPct = Math.round(cluster.confidence_score * 100)

  const handleVote = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isVoting) return
    setIsVoting(true)

    if (hasSupported) {
      try {
        await issuesApi.removeSupport(cluster.id)
        setHasSupported(false)
        setVotes(v => Math.max(0, v - 1))
        toast.success('Upvote removed')
        qc.invalidateQueries({ queryKey: ['clusters'] })
      } catch {
        toast.error('Could not remove upvote')
      } finally {
        setIsVoting(false)
      }
    } else {
      try {
        await issuesApi.support(cluster.id)
        setHasSupported(true)
        setVotes(v => v + 1)
        toast.success('Your upvote was recorded! 🚀')
        qc.invalidateQueries({ queryKey: ['clusters'] })
      } catch {
        toast.error('Already supported or error recording vote')
      } finally {
        setIsVoting(false)
      }
    }
  }

  return (
    <Link href={`/issues/${cluster.id}`}>
      <div className="card card-hover p-5 cursor-pointer animate-slide-up flex flex-col justify-between h-full group">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <StatusBadge status={cluster.status} />
                {cluster.is_escalated && (
                  <span className="badge badge-escalated flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {cluster.escalation_type === 'override' ? 'URGENT ACTION' : 'ESCALATED TO ADMIN'}
                  </span>
                )}
                {slaOverdue && (
                  <span className="badge bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20 flex items-center gap-1">
                    <Clock size={10} /> ACTION OVERDUE
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-white group-hover:text-[#00D4FF] transition-colors">
                {cluster.title}
              </h3>
            </div>
            <div className="text-right shrink-0">
              <div
                className="font-mono text-lg font-bold flex items-center justify-end gap-1"
                style={{ color: confidenceColor(cluster.confidence_score) }}
              >
                {momentumPct >= 70 && <Flame size={14} className="text-[#FF8800]" />}
                {momentumPct}%
              </div>
              <div className="text-[11px] text-[#64748B]">Impact Score</div>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="space-y-2 mb-4">
            <ScoreBar
              value={cluster.confidence_score}
              label="Campus Momentum"
              color={confidenceColor(cluster.confidence_score)}
            />
            <ScoreBar
              value={cluster.severity}
              label="Urgency Level"
              color={severityColor(cluster.severity)}
            />
          </div>

          {/* Backing and Engagement */}
          <div className="flex items-center justify-between gap-2 text-xs text-[#94A3B8] mb-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1" title="Students who reported this issue">
                <MessageSquare size={12} className="text-[#64748B]" />
                {cluster.report_count}
              </span>
              <span className="flex items-center gap-1" title="Public student views and comments">
                <MessageCircle size={12} className="text-[#00D4FF]" />
                {cluster.comment_count ?? 0}
              </span>
              <span className="flex items-center gap-1" title="Academic departments affected">
                <Users size={12} className="text-[#B44FFF]" />
                {cluster.departments_involved.length} {cluster.departments_involved.length === 1 ? 'branch' : 'branches'}
              </span>
            </div>

            {/* Direct Upvote Button */}
            <button
              onClick={handleVote}
              disabled={isVoting}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                hasSupported
                  ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40 shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                  : 'bg-[#1C2333] text-[#94A3B8] hover:text-[#00D4FF] hover:bg-[#1C2333]/90 border border-white/[0.08]'
              }`}
              title={hasSupported ? 'Click to remove your upvote' : 'Click to upvote this issue'}
            >
              <ThumbsUp size={11} className={hasSupported ? 'fill-[#00D4FF]' : ''} />
              <span>{votes}</span>
              <span className="hidden sm:inline">{hasSupported ? 'Upvoted' : 'Upvote'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-2 border-t border-white/[0.04]">
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#1C2333] text-[#94A3B8] capitalize">
              {cluster.category}
            </span>
            <span className="text-[11px]">{fmtRelative(cluster.last_activity_at)}</span>
          </div>

          {/* Diversity Guidance */}
          {!cluster.diversity_valid && cluster.report_count > 0 && (
            <div className="mt-2.5 px-2.5 py-1.5 rounded-md bg-[#FFB800]/5 border border-[#FFB800]/20 text-[11px] text-[#FFB800] leading-snug">
              💡 Needs upvotes from other branches to trend campus-wide
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
