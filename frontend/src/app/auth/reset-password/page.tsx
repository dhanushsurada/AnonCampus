'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'

const schema = z.object({
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/\d/, 'Must contain at least one number'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})
type FormData = z.infer<typeof schema>

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  if (!token) {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FF4444]/10 text-[#FF4444]">
          <AlertCircle size={20} />
        </div>
        <h2 className="text-base font-semibold">Missing Reset Token</h2>
        <p className="text-xs text-[#94A3B8]">
          The password reset link is invalid or has expired. Please request a new one.
        </p>
        <Link href="/auth/forgot-password" className="btn-primary block w-full text-sm py-2">
          Request New Link
        </Link>
      </div>
    )
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await authApi.resetPassword({
        token,
        new_password: data.password,
      })
      setSuccess(true)
      toast.success('Password updated successfully')
      setTimeout(() => {
        router.push('/auth/login')
      }, 2000)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reset password. Token may be expired.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#00FF88]/10 text-[#00FF88]">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="text-base font-semibold">Password Reset Complete</h2>
        <p className="text-xs text-[#94A3B8]">
          Your password has been securely updated. Redirecting you to sign in...
        </p>
        <Link href="/auth/login" className="btn-primary block w-full text-sm py-2">
          Go to Sign In
        </Link>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1.5">New password</label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPass ? 'text' : 'password'}
              className="input pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={11} />{errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-[#94A3B8] block mb-1.5">Confirm new password</label>
          <div className="relative">
            <input
              {...register('confirm_password')}
              type={showPass ? 'text' : 'password'}
              className="input pr-10"
              placeholder="••••••••"
            />
          </div>
          {errors.confirm_password && (
            <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={11} />{errors.confirm_password.message}
            </p>
          )}
        </div>

        <div className="text-[11px] text-[#64748B] space-y-1 bg-[#1C2333]/50 p-2.5 rounded-lg border border-white/[0.04]">
          <div className="font-medium text-[#94A3B8] mb-1">Password Requirements:</div>
          <div>• Minimum 8 characters</div>
          <div>• At least 1 uppercase letter (A-Z)</div>
          <div>• At least 1 digit (0-9)</div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? 'Updating password…' : 'Set New Password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center p-4 text-white">
      <div className="fixed inset-0 bg-glow-cyan pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 mb-4">
            <Shield size={18} className="text-[#00D4FF]" />
          </div>
          <h1 className="text-xl font-bold">Create New Password</h1>
          <p className="text-[#64748B] text-sm mt-1">
            Choose a secure password for your account
          </p>
        </div>

        <Suspense fallback={<div className="card p-6 text-center text-[#64748B]">Loading form…</div>}>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-center text-sm text-[#64748B] mt-5">
          <Link href="/auth/login" className="hover:text-white transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
