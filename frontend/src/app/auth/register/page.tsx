'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { DEPARTMENTS } from '@/types'

const YEARS = [1, 2, 3, 4]

const SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your mother\'s maiden name?',
  'What was your childhood nickname?',
  'What is your secret 4-digit recovery PIN?',
]

const schema = z.object({
  email:             z.string().email('Valid college email required'),
  password:          z.string().min(8,'Min 8 chars').regex(/[A-Z]/,'Need uppercase').regex(/\d/,'Need number'),
  student_id:        z.string().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Alphanumeric only'),
  department:        z.string().min(1, 'Select department'),
  academic_year:     z.coerce.number().int().min(1).max(4),
  security_question: z.string().min(3, 'Select a security question'),
  security_answer:   z.string().min(2, 'Answer must be at least 2 characters'),
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      academic_year: 1,
      security_question: SECURITY_QUESTIONS[0],
    },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await authApi.register(data)
      const loginRes = await authApi.login({ email: data.email, password: data.password })
      const { access_token, refresh_token } = loginRes.data
      const meRes = await authApi.me()
      setAuth(meRes.data, access_token, refresh_token)
      toast.success('Account created. Welcome!')
      router.push('/dashboard')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      let msg = 'Registration failed'
      if (typeof detail === 'string') {
        msg = detail
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg).join(', ')
      }
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080A0F] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-glow-cyan pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 mb-4">
            <Shield size={18} className="text-[#00D4FF]" />
          </div>
          <h1 className="text-xl font-bold">Create your account</h1>
          <p className="text-[#64748B] text-sm mt-1">Use your institution email</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1.5">College email</label>
              <input {...register('email')} type="email" className="input" placeholder="you@college.edu.in" />
              {errors.email && <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1"><AlertCircle size={11}/>{errors.email.message}</p>}
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1.5">Student / Roll number</label>
              <input {...register('student_id')} className="input font-mono uppercase" placeholder="25NU1A4430" />
              {errors.student_id && <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1"><AlertCircle size={11}/>{errors.student_id.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1.5">Department</label>
                <select {...register('department')} className="input">
                  <option value="">Select…</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.department && <p className="text-[#FF4444] text-xs mt-1">{errors.department.message}</p>}
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1.5">Year</label>
                <select {...register('academic_year')} className="input">
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1.5">Password</label>
              <div className="relative">
                <input {...register('password')} type={showPass ? 'text' : 'password'} className="input pr-10" placeholder="Min 8 chars, 1 uppercase, 1 number" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1"><AlertCircle size={11}/>{errors.password.message}</p>}
            </div>

            {/* Security Recovery Question */}
            <div className="pt-2 border-t border-white/[0.06] space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">
                  Security Recovery Question
                </label>
                <select {...register('security_question')} className="input text-xs">
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                {errors.security_question && (
                  <p className="text-[#FF4444] text-xs mt-1">{errors.security_question.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">
                  Secret Answer
                </label>
                <input
                  {...register('security_answer')}
                  type="text"
                  className="input text-xs"
                  placeholder="Only you know this answer…"
                />
                {errors.security_answer && (
                  <p className="text-[#FF4444] text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={11}/>{errors.security_answer.message}
                  </p>
                )}
                <p className="text-[11px] text-[#64748B] mt-1">
                  Required to reset your password if you ever lose access to your college email.
                </p>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#64748B] mt-4">
          Already registered?{' '}
          <Link href="/auth/login" className="text-[#00D4FF] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
