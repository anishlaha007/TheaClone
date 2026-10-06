import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button, ErrorBox, Logo, Spinner } from '../components/ui'
import { GitHubIcon } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function Login() {
  const [params] = useSearchParams()
  const location = useLocation()
  const user = useStore((s) => s.user)
  const ready = useStore((s) => s.ready)
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from || '/'
  if (ready && user) return <Navigate to={from} replace />
  if (!ready) return <div className="grid min-h-full place-items-center"><Spinner /></div>

  const redirectTo = `${window.location.origin}${from}`

  async function oauth(provider: 'google' | 'github') {
    setBusy(provider)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
    if (error) {
      setError(/not enabled|Unsupported provider/i.test(error.message) ? `${provider === 'google' ? 'Google' : 'GitHub'} sign-in isn't enabled for this project yet. Enable it in Supabase → Authentication → Providers.` : error.message)
      setBusy(null)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy('email')
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { full_name: name || undefined } } })
        if (error) throw error
        if (!data.session) setNotice('Check your inbox to confirm your email, then come back and log in.')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/settings` })
        if (error) throw error
        setNotice('If an account exists for that email, a reset link is on its way.')
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="font-display text-2xl font-bold">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-muted">{mode === 'signup' ? 'Free forever. Your kits and progress sync across devices.' : 'Log in to keep studying.'}</p>

          {mode !== 'reset' && (
            <div className="mt-6 space-y-2">
              <Button variant="secondary" className="w-full" onClick={() => oauth('google')} loading={busy === 'google'}>
                <GoogleIcon /> Continue with Google
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => oauth('github')} loading={busy === 'github'}>
                <GitHubIcon className="size-5" /> Continue with GitHub
              </Button>
              <div className="flex items-center gap-3 py-2 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <input className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            )}
            <input
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {mode !== 'reset' && (
              <input
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
                type="password"
                placeholder="Password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            )}
            {error ? <ErrorBox error={error} /> : null}
            {notice && <p className="rounded-xl bg-brand-soft p-3 text-sm">{notice}</p>}
            <Button type="submit" className="w-full" loading={busy === 'email'}>
              <Mail className="size-4" />
              {mode === 'signup' ? 'Sign up with email' : mode === 'reset' ? 'Send reset link' : 'Log in'}
            </Button>
          </form>

          <div className="mt-5 space-y-1 text-center text-sm text-muted">
            {mode === 'signin' && (
              <>
                <p>
                  New here?{' '}
                  <button className="font-semibold text-brand" onClick={() => setMode('signup')}>
                    Create an account
                  </button>
                </p>
                <button className="text-xs underline" onClick={() => setMode('reset')}>
                  Forgot password?
                </button>
              </>
            )}
            {mode !== 'signin' && (
              <p>
                Already have an account?{' '}
                <button className="font-semibold text-brand" onClick={() => setMode('signin')}>
                  Log in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
