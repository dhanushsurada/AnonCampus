'use client'
import { useState } from 'react'
import { X, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { issuesApi } from '@/lib/api'

interface AddContextModalProps {
  issueId: number
  onClose: () => void
  onSuccess: () => void
}

export function AddContextModal({ issueId, onClose, onSuccess }: AddContextModalProps) {
  const [contextText, setContextText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (contextText.trim().length < 15) {
      setError('Please provide at least 15 characters of specific context or evidence.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await issuesApi.addContext(issueId, contextText.trim())
      toast.success('Context added anonymously')
      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to record context. You may have already added context.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm text-white">
      <div className="relative w-full max-w-lg card p-6 border border-white/10 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#64748B] hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center text-[#00D4FF]">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Add Evidence & Context</h2>
            <p className="text-xs text-[#64748B]">Provide supplementary details anonymously</p>
          </div>
        </div>

        <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
          Adding factual details, timestamps, exact locations, or impact descriptions helps corroborate this grievance and accelerate administration response time.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs text-[#94A3B8]">Additional Information / Evidence</label>
              <span className={`text-[11px] font-mono ${contextText.length > 1000 ? 'text-[#FF4444]' : 'text-[#64748B]'}`}>
                {contextText.length}/1000
              </span>
            </div>
            <textarea
              value={contextText}
              onChange={(e) => { setContextText(e.target.value); setError('') }}
              maxLength={1000}
              rows={5}
              placeholder="e.g. This problem also happens in Room 302 between 2 PM and 4 PM during lab sessions..."
              className="input w-full resize-none text-sm py-2"
            />
            {error && (
              <p className="text-[#FF4444] text-xs mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-ghost text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || contextText.trim().length === 0}
              className="btn-primary text-xs px-4 py-2"
            >
              {loading ? 'Submitting…' : 'Submit Context'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
