import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { API_BASE } from './premiumHelpers'

export default function AuthPage({ onLogin }) {
  const Motion = motion
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    async function verifyFromQuery() {
      const params = new URLSearchParams(window.location.search)
      const verifyToken = params.get('verifyToken')
      if (!verifyToken) {
        return
      }

      try {
        setStatus('loading')
        setError('')
        const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verifyToken }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Email verification failed.')
        }
        setInfo(data.message || 'Email verified. You can now sign in.')
        const cleanUrl = `${window.location.origin}${window.location.pathname}`
        window.history.replaceState({}, '', cleanUrl)
      } catch (err) {
        setError(err.message)
      } finally {
        setStatus('idle')
      }
    }

    verifyFromQuery()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email || !password) {
      setError('Please provide both email and password.')
      return
    }

    try {
      setStatus('loading')
      setError('')
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed.')
      }

      if (isRegister) {
        // In dev, the backend returns an Ethereal verification link. Ethereal does not deliver
        // to real inboxes, so we auto-verify to keep local onboarding smooth.
        const devVerificationUrl = data?.dev?.verificationUrl
        if (devVerificationUrl) {
          const match = String(devVerificationUrl).match(/verifyToken=([^&]+)/)
          const verifyToken = match?.[1] ? decodeURIComponent(match[1]) : null
          if (verifyToken) {
            const verifyResp = await fetch(`${API_BASE}/api/auth/verify-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: verifyToken }),
            })
            const verifyData = await verifyResp.json()
            if (!verifyResp.ok) {
              throw new Error(verifyData.error || 'Email verification failed.')
            }
            setInfo('Account created and verified (dev mode). You can now sign in.')
          } else {
            setInfo(data.message || 'Account created. Verify your email before login.')
          }
        } else {
          setInfo(data.message || 'Account created. Check your email to verify before login.')
        }

        setIsRegister(false)
        setPassword('')
        setStatus('idle')
        return
      }

      localStorage.setItem('auth_token', data.token)
      onLogin(data.token)
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6"
      style={{ background: '#09090b' }}
    >
      {/* Ambient gold glow */}
      <div className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 500px 400px at 50% 30%, rgba(201,168,76,0.08), transparent), radial-gradient(ellipse 300px 300px at 50% 70%, rgba(255,255,255,0.015), transparent)',
        }}
      />

      <Motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[420px] rounded-[28px] border border-white/[0.06] bg-white/[0.015] p-8 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_30px_80px_rgba(0,0,0,0.3)] backdrop-blur-lg"
      >
        <div className="mb-10 text-center">
          {/* Decorative mark */}
          <div className="mx-auto mb-6 flex h-10 w-10 items-center justify-center text-[#c9a84c] text-xl">
            ✦
          </div>
          <h1 className="font-serif text-[2rem] font-semibold text-white tracking-[-0.02em] leading-tight">
            {isRegister ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-zinc-500">
            {isRegister
              ? 'Sign up to access your AI-powered data workspace.'
              : 'Sign in to continue exploring your datasets.'}
          </p>
        </div>

        {error && (
          <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 rounded-[14px] border border-red-500/15 bg-red-500/[0.06] p-4 text-[13px] text-red-300">
            {error}
          </Motion.div>
        )}
        {info && (
          <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 rounded-[14px] border border-emerald-500/15 bg-emerald-500/[0.08] p-4 text-[13px] text-emerald-200">
            {info}
          </Motion.div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-2.5 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-[15px] text-white outline-none transition-all duration-300 placeholder:text-zinc-600 focus:border-[#c9a84c]/40 focus:bg-white/[0.03] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.06)]"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-2.5 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-[15px] text-white outline-none transition-all duration-300 placeholder:text-zinc-600 focus:border-[#c9a84c]/40 focus:bg-white/[0.03] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.06)]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="btn-gold mt-3 w-full rounded-[14px] px-5 py-3.5 text-sm tracking-[0.04em]"
          >
            {status === 'loading' ? 'Processing...' : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div className="mt-8 text-center text-[13px] text-zinc-500">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); setInfo('') }}
            className="text-[#c9a84c] hover:text-[#e2cc7a] transition-colors duration-200 font-medium"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </Motion.div>
    </main>
  )
}
