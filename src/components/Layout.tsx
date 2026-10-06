import { NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Home, Plus, Settings as SettingsIcon, Flame, Cloud, CloudOff, Loader2, LogOut } from 'lucide-react'
import { Logo } from './ui'
import { useStore, signOut } from '../lib/store'
import { computeStreak } from '../lib/utils'

const nav = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/new', label: 'Create', icon: Plus },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

function SyncBadge() {
  const sync = useStore((s) => s.sync)
  if (sync.error)
    return (
      <span className="flex items-center gap-1.5 text-xs text-bad" title={sync.error}>
        <CloudOff className="size-3.5" /> Not saved
      </span>
    )
  if (sync.pending)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <Cloud className="size-3.5" /> Saved
    </span>
  )
}

export default function Layout() {
  const streak = useStore((s) => computeStreak(s.activity.days))
  const user = useStore((s) => s.user)
  const location = useLocation()
  const immersive = /\/(smart|flashcards|test|games\/.+)$/.test(location.pathname)

  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <NavLink to="/" className="mb-8 px-2">
          <Logo />
        </NavLink>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink')
              }
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-2xl bg-citrus-soft p-4">
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <Flame className="size-5 text-citrus" /> {streak} day{streak === 1 ? '' : 's'}
            </div>
            <p className="mt-1 text-xs text-muted">{streak ? 'Keep your streak going: study something today.' : 'Study today to start a streak.'}</p>
          </div>
          {user && (
            <div className="flex items-center gap-2 rounded-xl px-2 py-1">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{user.name.slice(0, 1).toUpperCase()}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <SyncBadge />
              </div>
              <button onClick={() => signOut()} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" title="Sign out" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
          <NavLink to="/">
            <Logo />
          </NavLink>
          <div className="flex items-center gap-3">
            <SyncBadge />
            <span className="flex items-center gap-1 rounded-full bg-citrus-soft px-2.5 py-1 text-sm font-bold">
              <Flame className="size-4 text-citrus" />
              {streak}
            </span>
          </div>
        </header>
        <main className={clsx('mx-auto w-full flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-12', immersive ? 'max-w-4xl' : 'max-w-6xl')}>
          <Outlet />
        </main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => clsx('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-muted')}
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
