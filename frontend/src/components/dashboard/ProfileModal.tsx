'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Shield, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

const schema = z.object({
  current_password: z.string().min(1, 'Current password required'),
  new_password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/\d/, 'Must contain at least one number'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})
type FormData = z.infer<typeof schema>

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'profile' | 'security'>('profile')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmitPasswordChange = async (data: FormData) => {
    setLoading(true)
    try {
      await authApi.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast.success('Password changed successfully')
      reset()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md card p-6 text-white border border-white/10 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#64748B] hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center text-[#00D4FF]">
            <Shield size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Account Settings</h2>
            <p className="text-xs text-[#64748B]">Manage your identity & security</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-lg bg-[#1C2333]/50 border border-white/[0.04] mb-5">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'profile'
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            Profile Info
          </button>
          <button
            onClick={() => setTab('security')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'security'
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            Change Password
          </button>
        </div>

        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="space-y-3 bg-[#1C2333]/30 p-4 rounded-xl border border-white/[0.04]">
              <div>
                <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider block">
                  Email
                </span>
                <span className="text-sm font-medium">{user?.email}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider block">
                    Department
                  </span>
                  <span className="text-sm">{user?.department || '—'}</span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider block">
                    Academic Year
                  </span>
                  <span className="text-sm">Year {user?.academic_year || '—'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider block">
                    Role
                  </span>
                  <span className="text-sm capitalize font-medium text-[#00D4FF]">{user?.role}</span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider block">
                    Trust Score
                  </span>
                  <span className="text-sm font-mono font-semibold text-[#00FF88]">
                    {user?.trust_score?.toFixed(2) ?? '1.00'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/20 text-xs text-[#94A3B8] flex items-start gap-2">
              <UserCheck size={16} className="text-[#00D4FF] shrink-0 mt-0.5" />
              <span>
                Your real identity is never attached to submitted issues or corroborations. Only your anonymous token and aggregate demographic metrics are visible.
              </span>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <form onSubmit={handleSubmit(onSubmitPasswordChange)} className="space-y-4">
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Current Password</label>
              <div className="relative">
                <input
                  {...register('current_password')}
                  type={showCurrentPass ? 'text' : 'password'}
                  className="input pr-10 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                >
                  {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.current_password && (
                <p className="text-[#FF4444] text-xs mt-1">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">New Password</label>
              <div className="relative">
                <input
                  {...register('new_password')}
                  type={showNewPass ? 'text' : 'password'}
                  className="input pr-10 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                >
                  {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.new_password && (
                <p className="text-[#FF4444] text-xs mt-1">{errors.new_password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Confirm New Password</label>
              <input
                {...register('confirm_password')}
                type={showNewPass ? 'text' : 'password'}
                className="input text-sm"
                placeholder="••••••••"
              />
              {errors.confirm_password && (
                <p className="text-[#FF4444] text-xs mt-1">{errors.confirm_password.message}</p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
