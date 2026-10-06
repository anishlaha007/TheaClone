import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Lightbulb, RotateCcw, SkipForward, Delete, Trophy } from 'lucide-react'
import { useKitContext } from '../kit/KitLayout'
import { getKit, recordStudy, updateKit } from '../../lib/store'
import { Button, Panel, Bar } from '../../components/ui'
import { shuffle } from '../../lib/utils'
import type { Card } from '../../lib/types'

const ROUNDS = 8

/**
 * Short terms are rebuilt letter by letter; long multi-word terms are
 * rebuilt word by word so the puzzle stays fair.
 */
function tokenize(term: string): { tokens: string[]; byWord: boolean } {
  const clean = term.trim()
  const words = clean.split(/\s+/)
  if (clean.replace(/\s/g, '').length > 14 && words.length > 1) return { tokens: words, byWord: true }
  return { tokens: [...clean.replace(/\s+/g, ' ')].filter((ch) => ch !== ' '), byWord: false }
}

type Tile = { id: number; text: string }

function setup(card: Card) {
  const { tokens, byWord } = tokenize(card.term)
  let tiles = tokens.map((t, i) => ({ id: i, text: t }))
  for (let i = 0; i < 5 && tiles.every((t, j) => t.id === j); i++) tiles = shuffle(tiles)
  return { tokens, byWord, tiles }
}

function TermBuilderGame({ onRestart }: { onRestart: () => void }) {
  const { kit } = useKitContext()
  const deck = useMemo(() => shuffle(kit.cards.filter((c) => c.term.length <= 60)).slice(0, ROUNDS), [kit.cards])
  const [round, setRound] = useState(0)
  const [state, setState] = useState(() => setup(deck[0]))
  const [placed, setPlaced] = useState<Tile[]>([])
  const [hints, setHints] = useState(0)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<'play' | 'right' | 'wrong' | 'skipped'>('play')
  const [over, setOver] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)

  const card = deck[round]
  const remaining = state.tiles.filter((t) => !placed.some((p) => p.id === t.id))
  const target = state.tokens.join(state.byWord ? ' ' : '')
  const built = placed.map((p) => p.text).join(state.byWord ? ' ' : '')

  useEffect(() => {
    if (status !== 'play' || placed.length !== state.tokens.length) return
    const ok = built.toLowerCase() === target.toLowerCase()
    if (ok) {
      setStatus('right')
      setCorrectCount((c) => c + 1)
      setScore((s) => s + Math.max(20, 100 - hints * 25))
    } else setStatus('wrong')
  }, [placed, built, target, state.tokens.length, status, hints])

  function place(t: Tile) {
    if (status !== 'play') return
    setPlaced((p) => [...p, t])
  }

  function undo() {
    if (status === 'right' || status === 'skipped') return
    setStatus('play')
    setPlaced((p) => p.slice(0, -1))
  }

  function hint() {
    // Reveal the next correct tile (after removing any wrong ones).
    let p = placed
    while (p.length && p.some((x, i) => x.text.toLowerCase() !== state.tokens[i].toLowerCase())) p = p.slice(0, -1)
    const nextText = state.tokens[p.length]
    const tile = state.tiles.find((t) => t.text === nextText && !p.some((x) => x.id === t.id))
    if (!tile) return
    setHints((h) => h + 1)
    setStatus('play')
    setPlaced([...p, tile])
  }

  function next() {
    if (round + 1 >= deck.length) {
      setOver(true)
      recordStudy(kit.id, deck.length, correctCount)
      if (score > (getKit(kit.id)?.games?.builderBest || 0)) updateKit(kit.id, (k) => ({ games: { ...k.games, builderBest: score } }))
      return
    }
    const r = round + 1
    setRound(r)
    setState(setup(deck[r]))
    setPlaced([])
    setHints(0)
    setStatus('play')
  }

  if (!card) return null

  if (over) {
    return (
      <Panel className="anim-pop mx-auto max-w-lg p-8 text-center">
        <Trophy className="mx-auto size-12 text-citrus" />
        <h2 className="mt-3 font-display text-4xl font-extrabold">{score} points</h2>
        <p className="mt-1 text-muted">
          {correctCount}/{deck.length} terms built · Best {Math.max(score, kit.games?.builderBest || 0)}
        </p>
        <Button className="mt-5" onClick={onRestart}>
          <RotateCcw className="size-4" /> Play again
        </Button>
      </Panel>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Term Builder</h2>
        <span className="font-display text-lg font-bold">{score} pts</span>
      </div>
      <Bar value={(round / deck.length) * 100} />

      <Panel className="p-6">
        <div className="text-xs font-bold tracking-wide text-muted uppercase">Definition</div>
        <p className="mt-2 text-lg">{card.definition}</p>
      </Panel>

      <div
        className={clsx(
          'flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4',
          status === 'right' ? 'border-good bg-good-soft' : status === 'wrong' ? 'anim-shake border-bad bg-bad-soft' : 'border-line',
        )}
      >
        {placed.length === 0 && <span className="text-sm text-muted">Tap the tiles in order</span>}
        {placed.map((t) => (
          <span key={t.id} className="rounded-lg bg-ink px-3 py-2 font-display text-lg font-bold text-bg">
            {t.text}
          </span>
        ))}
        {status === 'skipped' && <span className="font-display text-lg font-bold">{card.term}</span>}
      </div>

      {status === 'play' || status === 'wrong' ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {remaining.map((t) => (
              <button key={t.id} onClick={() => place(t)} className="min-w-11 rounded-xl border-2 border-line bg-surface px-3 py-2.5 font-display text-lg font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-brand">
                {t.text}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={undo} disabled={!placed.length}>
              <Delete className="size-4" /> Undo
            </Button>
            <Button variant="secondary" onClick={hint}>
              <Lightbulb className="size-4" /> Hint (−25)
            </Button>
            <Button variant="ghost" onClick={() => setStatus('skipped')}>
              <SkipForward className="size-4" /> Show answer
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className={clsx('mb-3 font-semibold', status === 'right' ? 'text-good' : 'text-muted')}>{status === 'right' ? (hints ? `Built with ${hints} hint${hints > 1 ? 's' : ''}` : 'Perfect!') : 'No points this time.'}</p>
          <Button onClick={next}>{round + 1 >= deck.length ? 'See results' : 'Next term'}</Button>
        </div>
      )}
    </div>
  )
}

export default function TermBuilder() {
  const [game, setGame] = useState(0)
  return <TermBuilderGame key={game} onRestart={() => setGame((g) => g + 1)} />
}
