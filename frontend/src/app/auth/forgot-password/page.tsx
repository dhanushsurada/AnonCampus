'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Shield, Mail, AlertCircle, ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'

const schema = z.object({
  email: z.string().email('Valid college email required'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(data.email)
      setSubmitted(true)
      toast.success('Password reset request submitted')
      if (res.data?.reset_url) {
        setDevResetUrl(res.data.reset_url)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to request password reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center p-4 text-white">
      <div className="fixed inset-0 bg-glow-cyan pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 mb-4">
            <Shield size={18} className="text-[#00D4FF]" />
          </div>
          <h1 className="text-xl font-bold">Forgot Password</h1>
          <p className="text-[#64748B] text-sm mt-1">
            Enter your college email to receive a password reset link
          </p>
        </div>

        <div className="card p-6">
          {!submitted ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1.5">College email</label>
                <div className="relative">
                  <input
                    {...register('email')}
                    type="email"
                    className="input pl-9"
                    placeholder="you@college.edu.in"
                  />
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                </div>
                {errors.email && (
                  <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={11} />{errors.email.message}
                  </p>
                )}
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
              <h2 className="text-base font-semibold">Check your inbox</h2>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                If an account exists with that email, a password reset link has been dispatched.
              </p>

              {devResetUrl && (
                <div className="mt-4 p-3 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-left">
                  <p className="text-[11px] font-mono text-[#00D4FF] font-semibold mb-1 uppercase tracking-wide">
                    Dev Mode Shortcut
                  </p>
                  <p className="text-xs text-[#94A3B8] mb-2">
                    In development, you can proceed directly with this generated reset token:
                  </p>
                  <Link
                    href={devResetUrl}
                    className="inline-flex items-center gap-1 text-xs text-[#00D4FF] hover:underline font-medium"
                  >
                    Open Reset Password Page <ExternalLink size={12} />
                  </Link>
                </div>
              )}
            </div>
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
