'use client'
import { Cluster } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScoreBar } from '@/components/ui/ScoreBar'
import { fmtRelative, severityColor, confidenceColor } from '@/lib/utils'
import { AlertTriangle, Users, MessageSquare, ThumbsUp, Clock, Flame, Sparkles } from 'lucide-react'
import Link from 'next/link'

export function ClusterCard({ cluster }: { cluster: Cluster }) {
  const slaOverdue = cluster.sla_deadline && new Date(cluster.sla_deadline) < new Date()
  const momentumPct = Math.round(cluster.confidence_score * 100)

  return (
    <Link href={`/issues/${cluster.id}`}>
      <div className="card card-hover p-5 cursor-pointer animate-slide-up flex flex-col justify-between h-full">
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
              <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-white hover:text-[#00D4FF] transition-colors">
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
          <div className="flex items-center gap-3.5 text-xs text-[#94A3B8] mb-3">
            <span className="flex items-center gap-1" title="Students who reported this issue">
              <MessageSquare size={12} className="text-[#64748B]" />
              {cluster.report_count} {cluster.report_count === 1 ? 'report' : 'reports'}
            </span>
            <span className="flex items-center gap-1" title="Students who upvoted this issue">
              <ThumbsUp size={12} className="text-[#00D4FF]" />
              {cluster.support_count} {cluster.support_count === 1 ? 'upvote' : 'upvotes'}
            </span>
            <span className="flex items-center gap-1" title="Academic departments affected">
              <Users size={12} className="text-[#B44FFF]" />
              {cluster.departments_involved.length} {cluster.departments_involved.length === 1 ? 'branch' : 'branches'}
            </span>
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
