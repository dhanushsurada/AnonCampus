'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  X, Shield, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2,
  UserCheck, Lock, Save, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { DEPARTMENTS } from '@/types'

const passwordSchema = z.object({
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
type PasswordFormData = z.infer<typeof passwordSchema>

const profileSchema = z.object({
  department: z.string().min(1, 'Select a department'),
  academic_year: z.coerce.number().min(1).max(4),
  security_question: z.string().optional(),
  security_answer: z.string().optional(),
})
type ProfileFormData = z.infer<typeof profileSchema>

const SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your mother\'s maiden name?',
  'What was your childhood nickname?',
  'What is your secret 4-digit recovery PIN?',
]

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuthStore()
  const [tab, setTab] = useState<'profile' | 'security'>('profile')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [loadingPass, setLoadingPass] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [showQuestionEdit, setShowQuestionEdit] = useState(false)

  // Password form
  const passForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  // Profile form
  const profForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      department: user?.department || 'CSE',
      academic_year: user?.academic_year || 1,
      security_question: SECURITY_QUESTIONS[0],
      security_answer: '',
    },
  })

  const onSubmitPasswordChange = async (data: PasswordFormData) => {
    setLoadingPass(true)
    try {
      await authApi.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      toast.success('Password changed successfully')
      passForm.reset()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update password')
    } finally {
      setLoadingPass(false)
    }
  }

  const onSubmitProfileUpdate = async (data: ProfileFormData) => {
    setLoadingProfile(true)
    try {
      const payload: any = {
        department: data.department,
        academic_year: data.academic_year,
      }
      if (showQuestionEdit && data.security_answer?.trim()) {
        payload.security_question = data.security_question
        payload.security_answer = data.security_answer.trim()
      }

      const res = await authApi.updateProfile(payload)
      // Update global Zustand store
      setUser(res.data)
      toast.success('Profile updated successfully')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update profile')
    } finally {
      setLoadingProfile(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg card p-6 text-white border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
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
            <h2 className="text-lg font-bold">Account & Profile Settings</h2>
            <p className="text-xs text-[#64748B]">Manage your academic profile & security</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-lg bg-[#1C2333]/50 border border-white/[0.04] mb-5">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'profile'
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            Edit Profile
          </button>
          <button
            type="button"
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
          <form onSubmit={profForm.handleSubmit(onSubmitProfileUpdate)} className="space-y-4">
            {/* Locked Immutable Fields Section */}
            <div className="p-3.5 rounded-xl bg-[#1C2333]/40 border border-white/[0.04] space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[#64748B] pb-1 border-b border-white/[0.04]">
                <span className="font-mono text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <Lock size={11} className="text-[#64748B]" /> Locked Institutional Identity
                </span>
                <span className="text-[10px]">Cannot be modified</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[11px] text-[#64748B] block mb-0.5">College Email</span>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#94A3B8]">
                    <span className="truncate">{user?.email}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-[#64748B] block mb-0.5">Account Role</span>
                  <span className="text-xs font-medium capitalize text-[#00D4FF]">{user?.role}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-[#64748B] block mb-0.5">Anonymous Identifier (Token)</span>
                <span className="text-xs font-mono text-[#94A3B8] truncate block">
                  {user?.anon_id || 'Secure anonymous cryptographic ID'}
                </span>
              </div>
            </div>

            {/* Editable Profile Fields */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Editable Academic Details</span>
                <span className="text-[11px] text-[#00D4FF]">Updateable</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1">Department</label>
                  <select {...profForm.register('department')} className="input text-xs w-full">
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {profForm.formState.errors.department && (
                    <p className="text-[#FF4444] text-[11px] mt-1">{profForm.formState.errors.department.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1">Academic Year</label>
                  <select {...profForm.register('academic_year')} className="input text-xs w-full">
                    {[1, 2, 3, 4].map((y) => (
                      <option key={y} value={y}>Year {y}</option>
                    ))}
                  </select>
                  {profForm.formState.errors.academic_year && (
                    <p className="text-[#FF4444] text-[11px] mt-1">{profForm.formState.errors.academic_year.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recovery Question update toggle */}
            <div className="pt-2 border-t border-white/[0.04]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-[#94A3B8] block">Recovery Security Question</label>
                <button
                  type="button"
                  onClick={() => setShowQuestionEdit(!showQuestionEdit)}
                  className="text-xs text-[#00D4FF] hover:underline"
                >
                  {showQuestionEdit ? 'Cancel Question Edit' : 'Update Question & Answer'}
                </button>
              </div>

              {showQuestionEdit && (
                <div className="space-y-2.5 p-3 rounded-lg bg-[#1C2333]/30 border border-white/[0.04] animate-fadeIn">
                  <div>
                    <label className="text-[11px] text-[#64748B] block mb-1">Select Question</label>
                    <select {...profForm.register('security_question')} className="input text-xs">
                      {SECURITY_QUESTIONS.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#64748B] block mb-1">New Secret Answer</label>
                    <input
                      {...profForm.register('security_answer')}
                      type="text"
                      className="input text-xs"
                      placeholder="Type your secret answer…"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/20 text-xs text-[#94A3B8] flex items-start gap-2">
              <UserCheck size={16} className="text-[#00D4FF] shrink-0 mt-0.5" />
              <span>
                Your identity remains protected. Updating your department or academic year updates demographic diversity metrics for your future grievance submissions.
              </span>
            </div>

            <button
              type="submit"
              disabled={loadingProfile}
              className="btn-primary w-full mt-3 flex items-center justify-center gap-1.5 text-xs py-2.5"
            >
              <Save size={14} />
              {loadingProfile ? 'Saving Changes…' : 'Save Profile Changes'}
            </button>
          </form>
        )}

        {tab === 'security' && (
          <form onSubmit={passForm.handleSubmit(onSubmitPasswordChange)} className="space-y-4">
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Current Password</label>
              <div className="relative">
                <input
                  {...passForm.register('current_password')}
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
              {passForm.formState.errors.current_password && (
                <p className="text-[#FF4444] text-xs mt-1">{passForm.formState.errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">New Password</label>
              <div className="relative">
                <input
                  {...passForm.register('new_password')}
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
              {passForm.formState.errors.new_password && (
                <p className="text-[#FF4444] text-xs mt-1">{passForm.formState.errors.new_password.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Confirm New Password</label>
              <input
                {...passForm.register('confirm_password')}
                type={showNewPass ? 'text' : 'password'}
                className="input text-sm"
                placeholder="••••••••"
              />
              {passForm.formState.errors.confirm_password && (
                <p className="text-[#FF4444] text-xs mt-1">{passForm.formState.errors.confirm_password.message}</p>
              )}
            </div>

            <button type="submit" disabled={loadingPass} className="btn-primary w-full mt-2">
              {loadingPass ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
