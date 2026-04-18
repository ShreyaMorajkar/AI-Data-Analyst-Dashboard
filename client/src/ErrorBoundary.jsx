import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected client error.',
    }
  }

  componentDidCatch(error) {
    console.error('Dashboard render failure:', error)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#050b16] px-6 py-10 text-slate-100">
          <div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
            <section className="w-full rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_24px_80px_rgba(2,6,23,0.3)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recovery Mode</div>
              <h1 className="mt-4 text-3xl font-semibold text-white">The dashboard hit a client-side error.</h1>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Your backend data is unaffected. Reload the app to restore the workspace and continue.
              </p>
              <div className="mt-5 rounded-[20px] border border-rose-400/18 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {this.state.message}
              </div>
              <button
                type="button"
                onClick={this.handleReload}
                className="mt-6 rounded-[18px] bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Reload dashboard
              </button>
            </section>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
