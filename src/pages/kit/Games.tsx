import { Link } from 'react-router-dom'
import { Puzzle, Blocks, Type, Trophy } from 'lucide-react'
import { useKitContext } from './KitLayout'
import { formatDuration } from '../../lib/utils'
import { EmptyState, LinkButton } from '../../components/ui'

export default function Games() {
  const { kit } = useKitContext()
  const best = kit.games || {}
  const games = [
    {
      to: 'match',
      icon: Puzzle,
      title: 'Definition Match',
      body: 'Pair every term with its definition as fast as you can. Wrong pairs cost you a second.',
      best: best.matchBest ? `Best ${formatDuration(best.matchBest / 1000)}.${String(Math.floor((best.matchBest % 1000) / 100))}` : null,
      bg: 'from-brand/20 to-brand/5',
      min: 3,
    },
    {
      to: 'stacker',
      icon: Blocks,
      title: 'Stacker',
      body: 'Every right answer drops a block on your tower. Miss and it crumbles. How high can you go in 60 seconds?',
      best: best.stackerBest ? `Best ${best.stackerBest} blocks` : null,
      bg: 'from-citrus/30 to-citrus/5',
      min: 4,
    },
    {
      to: 'builder',
      icon: Type,
      title: 'Term Builder',
      body: 'Read the definition, then rebuild the term from scrambled tiles. Hints cost points.',
      best: best.builderBest ? `Best ${best.builderBest} pts` : null,
      bg: 'from-[#6E56CF]/25 to-[#6E56CF]/5',
      min: 1,
    },
  ]

  if (kit.cards.length < 1) {
    return <EmptyState icon={<Puzzle className="size-7" />} title="Add flashcards to play" body="Games use this kit's flashcards." action={<LinkButton to={`/kit/${kit.id}/cards`}>Add cards</LinkButton>} />
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {games.map((g) => {
        const locked = kit.cards.length < g.min
        return (
          <Link
            key={g.to}
            to={locked ? '#' : `/kit/${kit.id}/games/${g.to}`}
            className={`flex flex-col rounded-3xl border border-line bg-gradient-to-br ${g.bg} p-6 transition hover:-translate-y-1 hover:shadow-lg ${locked ? 'pointer-events-none opacity-50' : ''}`}
          >
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface shadow-sm">
              <g.icon className="size-7 text-ink" />
            </div>
            <h3 className="font-display text-2xl font-bold">{g.title}</h3>
            <p className="mt-2 flex-1 text-sm text-muted">{g.body}</p>
            <div className="mt-5 flex items-center justify-between">
              <span className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-bg">{locked ? `Needs ${g.min}+ cards` : 'Play'}</span>
              {g.best && (
                <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                  <Trophy className="size-3.5 text-citrus" /> {g.best}
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
