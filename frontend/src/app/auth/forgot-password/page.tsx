'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Shield, Mail, AlertCircle, ArrowLeft, CheckCircle2,
  ExternalLink, UserCheck, KeyRound, Eye, EyeOff, Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'

// Email form schema
const emailSchema = z.object({
  email: z.string().email('Valid college email required'),
})
type EmailFormData = z.infer<typeof emailSchema>

// Student credential recovery schema
const credentialSchema = z.object({
  email: z.string().email('Valid college email required'),
  student_id: z.string().min(3, 'Student ID / Roll Number required'),
  department: z.string().min(1, 'Department required'),
  academic_year: z.coerce.number().min(1).max(4),
  new_password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/\d/, 'Must contain at least one digit'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})
type CredentialFormData = z.infer<typeof credentialSchema>

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'email' | 'credentials'>('email')
  const [loading, setLoading] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [emailSentStatus, setEmailSentStatus] = useState<boolean>(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  // Email form
  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  })

  // Credential form
  const credForm = useForm<CredentialFormData>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      department: 'CSE',
      academic_year: 3,
    },
  })

  const onEmailSubmit = async (data: EmailFormData) => {
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(data.email)
      setSubmittedEmail(data.email)
      setEmailSentStatus(!!res.data?.email_sent)
      if (res.data?.reset_url) {
        setDevResetUrl(res.data.reset_url)
      }
      toast.success('Password reset request processed')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to request password reset')
    } finally {
      setLoading(false)
    }
  }

  const onCredentialSubmit = async (data: CredentialFormData) => {
    setLoading(true)
    try {
      await authApi.resetPasswordByStudentCredentials({
        email: data.email,
        student_id: data.student_id,
        department: data.department,
        academic_year: data.academic_year,
        new_password: data.new_password,
      })
      toast.success('Password reset successfully via student credentials!')
      setTimeout(() => {
        router.push('/auth/login')
      }, 1500)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Student credentials do not match our records'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center p-4 text-white">
      <div className="fixed inset-0 bg-glow-cyan pointer-events-none" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 mb-3">
            <Shield size={18} className="text-[#00D4FF]" />
          </div>
          <h1 className="text-xl font-bold">Password Recovery</h1>
          <p className="text-[#64748B] text-xs mt-1">
            Recover access to your AnonCampus student account
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 p-1 rounded-lg bg-[#1C2333]/60 border border-white/[0.04] mb-4">
          <button
            type="button"
            onClick={() => setTab('email')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
              tab === 'email'
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            <Mail size={13} /> Via College Email
          </button>
          <button
            type="button"
            onClick={() => setTab('credentials')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
              tab === 'credentials'
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            <UserCheck size={13} /> Via Student ID
          </button>
        </div>

        <div className="card p-6 border border-white/10 shadow-2xl">
          {tab === 'email' ? (
            !submittedEmail ? (
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1.5">Registered College Email</label>
                  <div className="relative">
                    <input
                      {...emailForm.register('email')}
                      type="email"
                      className="input pl-9 text-sm"
                      placeholder="e.g. 22nu1a0401@nsrit.edu.in"
                    />
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  </div>
                  {emailForm.formState.errors.email && (
                    <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={11} />{emailForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-[#1C2333]/40 border border-white/[0.04] text-[11px] text-[#64748B] leading-relaxed flex items-start gap-2">
                  <Info size={14} className="text-[#00D4FF] shrink-0 mt-0.5" />
                  <span>
                    Note: Links sent to institutional addresses (e.g. NSRIT) are delivered only to college webmail, not personal Gmail accounts.
                  </span>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                  {loading ? 'Sending link…' : 'Send Reset Link'}
                </button>
              </form>
            ) : (
              <div className="text-center py-2 space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#00FF88]/10 text-[#00FF88] mb-1">
                  <CheckCircle2 size={24} />
                </div>
                <h2 className="text-base font-semibold">Instructions Dispatched</h2>

                {emailSentStatus ? (
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    A password reset link was dispatched via SMTP to{' '}
                    <span className="text-white font-medium">{submittedEmail}</span>. Please check your college webmail inbox or spam folder.
                  </p>
                ) : (
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    A reset token has been generated for{' '}
                    <span className="text-white font-medium">{submittedEmail}</span>.
                  </p>
                )}

                {devResetUrl && (
                  <div className="mt-4 p-4 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-left">
                    <p className="text-[11px] font-mono text-[#00D4FF] font-semibold mb-1 uppercase tracking-wide">
                      Instant Reset Link (Local / Dev)
                    </p>
                    <p className="text-xs text-[#94A3B8] mb-3">
                      You can proceed directly without waiting for external email server delivery:
                    </p>
                    <Link
                      href={devResetUrl}
                      className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-3 w-full justify-center"
                    >
                      Open Password Reset Page <ExternalLink size={13} />
                    </Link>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSubmittedEmail(null)
                      setDevResetUrl(null)
                    }}
                    className="text-xs text-[#64748B] hover:text-white"
                  >
                    Try a different email
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Student Credential Recovery Path */
            <form onSubmit={credForm.handleSubmit(onCredentialSubmit)} className="space-y-3.5">
              <div className="p-3 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/20 text-xs text-[#94A3B8] flex items-start gap-2 mb-2">
                <UserCheck size={16} className="text-[#00D4FF] shrink-0 mt-0.5" />
                <span>
                  Bypass college email delivery filters by authenticating with your registered Student ID / Roll Number.
                </span>
              </div>

              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">College Email</label>
                <input
                  {...credForm.register('email')}
                  type="email"
                  className="input text-xs"
                  placeholder="student@nsrit.edu.in"
                />
                {credForm.formState.errors.email && (
                  <p className="text-[#FF4444] text-[11px] mt-1">{credForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Student ID / Roll Number</label>
                <input
                  {...credForm.register('student_id')}
                  type="text"
                  className="input text-xs font-mono uppercase"
                  placeholder="e.g. 22NU1A0401"
                />
                {credForm.formState.errors.student_id && (
                  <p className="text-[#FF4444] text-[11px] mt-1">{credForm.formState.errors.student_id.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1">Department</label>
                  <select {...credForm.register('department')} className="input text-xs">
                    {['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1">Academic Year</label>
                  <select {...credForm.register('academic_year')} className="input text-xs">
                    {[1, 2, 3, 4].map((y) => (
                      <option key={y} value={y}>Year {y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">New Password</label>
                <div className="relative">
                  <input
                    {...credForm.register('new_password')}
                    type={showPass ? 'text' : 'password'}
                    className="input pr-9 text-xs"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                  >
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {credForm.formState.errors.new_password && (
                  <p className="text-[#FF4444] text-[11px] mt-1">{credForm.formState.errors.new_password.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Confirm New Password</label>
                <input
                  {...credForm.register('confirm_password')}
                  type={showPass ? 'text' : 'password'}
                  className="input text-xs"
                  placeholder="••••••••"
                />
                {credForm.formState.errors.confirm_password && (
                  <p className="text-[#FF4444] text-[11px] mt-1">{credForm.formState.errors.confirm_password.message}</p>
                )}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2 text-xs py-2.5">
                {loading ? 'Verifying & Resetting…' : 'Reset Password with Student ID'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#64748B] mt-5">
          <Link href="/auth/login" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
            <ArrowLeft size={13} /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
