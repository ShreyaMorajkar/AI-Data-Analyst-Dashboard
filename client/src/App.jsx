import { lazy, Suspense, useState } from 'react'

const PremiumDashboard = lazy(() => import('./PremiumDashboard'))
import AuthPage from './AuthPage'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false
    return Boolean(window.localStorage.getItem('auth_token'))
  })

  if (!isAuthenticated) {
    return <AuthPage onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050b16] text-slate-100">
          <div className="mx-auto flex min-h-screen max-w-[1660px] items-center justify-center px-6">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-6 py-5 text-sm text-slate-400">
              Loading dashboard...
            </div>
          </div>
        </main>
      }
    >
      <PremiumDashboard />
    </Suspense>
  )
}
