'use client'
import { cn } from '@/lib/utils'

const MAP: Record<string, string> = {
  new: 'badge-new',
  active: 'badge-active',
  dormant: 'badge-dormant',
  archived: 'badge-archived',
  resolved: 'badge-resolved',
  reopened: 'badge-escalated',
}

const LABELS: Record<string, string> = {
  new: 'New Report',
  active: 'In Progress',
  dormant: 'Under Review',
  resolved: 'Resolved 🎉',
  archived: 'Closed',
  reopened: 'Reopened ⚠️',
}

export function StatusBadge({ status }: { status: string }) {
  const norm = status?.toLowerCase()
  return (
    <span className={cn('badge', MAP[norm] ?? 'badge-dormant')}>
      {LABELS[norm] ?? status.toUpperCase()}
    </span>
  )
}
