import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useOutletContext, useParams, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Brain, Layers, ClipboardCheck, BookOpen, AlignLeft, Headphones, Gamepad2, MessageCircle, ArrowLeft, LayoutGrid } from 'lucide-react'
import { ensureSourceText, useKit } from '../../lib/store'
import { EmptyState, LinkButton } from '../../components/ui'
import type { Kit } from '../../lib/types'

export const MODES = [
  { to: '', label: 'Overview', icon: LayoutGrid, end: true },
  { to: 'smart', label: 'Smart Study', icon: Brain },
  { to: 'flashcards', label: 'Flashcards', icon: Layers },
  { to: 'test', label: 'Practice test', icon: ClipboardCheck },
  { to: 'guide', label: 'Study guide', icon: BookOpen },
  { to: 'summary', label: 'Summary', icon: AlignLeft },
  { to: 'podcast', label: 'Podcast', icon: Headphones },
  { to: 'games', label: 'Games', icon: Gamepad2 },
  { to: 'chat', label: 'Tutor', icon: MessageCircle },
]

export function useKitContext() {
  return useOutletContext<{ kit: Kit }>()
}

/** Loads (once) and returns the kit's extracted source text. */
export function useSource(kit: Kit) {
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    if (kit.sourceText === undefined) ensureSourceText(kit.id).catch(setError)
  }, [kit.id, kit.sourceText])
  return { source: kit.sourceText, error, getSource: () => ensureSourceText(kit.id) }
}

export default function KitLayout() {
  const { id } = useParams()
  const kit = useKit(id)
  const navigate = useNavigate()
  const location = useLocation()
  const inGame = /\/games\/.+$/.test(location.pathname)

  if (!kit) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-7" />}
        title="Kit not found"
        body="It may have been deleted, or it belongs to a different account."
        action={<LinkButton to="/">Back home</LinkButton>}
      />
    )
  }

  return (
    <div>
      <div className="no-print mb-5 flex items-center gap-3">
        <button onClick={() => navigate(inGame ? `/kit/${kit.id}/games` : '/')} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: `${kit.color}22` }}>
          {kit.emoji}
        </div>
        <h1 className="min-w-0 truncate font-display text-xl font-bold md:text-2xl">{kit.title}</h1>
      </div>
      {!inGame && (
        <nav className="no-print -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
          {MODES.map((m) => (
            <NavLink
              key={m.to}
              to={m.to ? `/kit/${kit.id}/${m.to}` : `/kit/${kit.id}`}
              end={m.end}
              className={({ isActive }) =>
                clsx(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition',
                  isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
                )
              }
            >
              <m.icon className="size-4" />
              {m.label}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet context={{ kit }} />
    </div>
  )
}
