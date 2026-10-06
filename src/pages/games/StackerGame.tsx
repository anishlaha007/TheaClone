import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Blocks, RotateCcw, Timer, Zap } from 'lucide-react'
import { useKitContext } from '../kit/KitLayout'
import { getKit, recordStudy, updateKit } from '../../lib/store'
import { Button, Panel } from '../../components/ui'
import { shuffle, pick, KIT_COLORS } from '../../lib/utils'
import type { Card } from '../../lib/types'

const DURATION = 60
type Block = { id: number; offset: number; color: string; gold: boolean }
type Round = { card: Card; options: Card[]; reverse: boolean }

function makeRound(cards: Card[], last?: string): Round {
  const pool = cards.length > 1 ? cards.filter((c) => c.id !== last) : cards
  const card = pick(pool)
  const options = shuffle([card, ...shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3)])
  return { card, options, reverse: Math.random() < 0.3 }
}

export default function StackerGame() {
  const { kit } = useKitContext()
  const cards = kit.cards
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready')
  const [round, setRound] = useState<Round>(() => makeRound(cards))
  const [blocks, setBlocks] = useState<Block[]>([])
  const [peak, setPeak] = useState(0)
  const [streak, setStreak] = useState(0)
  const [left, setLeft] = useState(DURATION)
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null)
  const [answered, setAnswered] = useState({ total: 0, correct: 0 })
  const best = kit.games?.stackerBest || 0

  useEffect(() => {
    if (phase !== 'play') return
    const t = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'play' && left <= 0) {
      setPhase('over')
      recordStudy(kit.id, answered.total, answered.correct)
      const height = Math.max(peak, blocks.length)
      if (height > (getKit(kit.id)?.games?.stackerBest || 0)) updateKit(kit.id, (k) => ({ games: { ...k.games, stackerBest: height } }))
    }
  }, [left, phase, kit.id, peak, blocks.length, answered])

  function answer(c: Card) {
    if (phase !== 'play') return
    const right = c.id === round.card.id
    setAnswered((a) => ({ total: a.total + 1, correct: a.correct + (right ? 1 : 0) }))
    if (right) {
      const s = streak + 1
      setStreak(s)
      const gold = s > 0 && s % 5 === 0
      setBlocks((b) => {
        const next = [...b, { id: Date.now(), offset: Math.round((Math.random() - 0.5) * 28), color: gold ? 'var(--citrus)' : pick(KIT_COLORS), gold }]
        // Every 5-answer streak drops a bonus block.
        if (gold) next.push({ id: Date.now() + 1, offset: Math.round((Math.random() - 0.5) * 20), color: 'var(--citrus)', gold: true })
        setPeak((p) => Math.max(p, next.length))
        return next
      })
      setFlash('good')
    } else {
      setStreak(0)
      setBlocks((b) => b.slice(0, Math.max(0, b.length - 2)))
      setFlash('bad')
    }
    setTimeout(() => setFlash(null), 350)
    setRound(makeRound(cards, round.card.id))
  }

  function begin() {
    setBlocks([])
    setPeak(0)
    setStreak(0)
    setLeft(DURATION)
    setAnswered({ total: 0, correct: 0 })
    setRound(makeRound(cards))
    setPhase('play')
  }

  const visible = useMemo(() => blocks.slice(-11), [blocks])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Stacker</h2>
        <div className="flex items-center gap-4 text-sm font-semibold">
          {streak >= 2 && (
            <span className="flex items-center gap-1 text-citrus">
              <Zap className="size-4" /> {streak} streak
            </span>
          )}
          <span className={clsx('flex items-center gap-1.5 font-mono text-lg', left <= 10 && phase === 'play' && 'text-bad')}>
            <Timer className="size-4" /> {left}s
          </span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="order-2 space-y-3 md:order-1">
          {phase === 'ready' && (
            <Panel className="p-8 text-center">
              <Blocks className="mx-auto size-12 text-brand" />
              <h3 className="mt-3 font-display text-2xl font-bold">Build the tallest tower</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Each right answer adds a block. A wrong answer knocks two off. Hit a 5-answer streak for a golden bonus block.</p>
              <Button size="lg" className="mt-5" onClick={begin}>
                Start
              </Button>
            </Panel>
          )}
          {phase === 'play' && (
            <>
              <Panel className={clsx('p-5 transition', flash === 'good' && 'bg-good-soft', flash === 'bad' && 'anim-shake bg-bad-soft')}>
                <div className="text-xs font-bold tracking-wide text-muted uppercase">{round.reverse ? 'Which definition matches?' : 'Which term matches?'}</div>
                <p className="mt-2 font-display text-lg font-bold">{round.reverse ? round.card.term : round.card.definition}</p>
              </Panel>
              <div className="grid gap-2 sm:grid-cols-2">
                {round.options.map((o) => (
                  <button key={o.id} onClick={() => answer(o)} className="rounded-xl border-2 border-line bg-surface p-3.5 text-left text-sm font-medium transition hover:border-brand active:scale-[.98]">
                    {round.reverse ? o.definition : o.term}
                  </button>
                ))}
              </div>
            </>
          )}
          {phase === 'over' && (
            <Panel className="anim-pop p-8 text-center">
              <h3 className="font-display text-4xl font-extrabold">{peak} blocks</h3>
              <p className="mt-1 text-muted">
                {answered.correct}/{answered.total} correct · {peak > best ? 'New personal best!' : `Best: ${Math.max(best, peak)}`}
              </p>
              <Button className="mt-5" onClick={begin}>
                <RotateCcw className="size-4" /> Play again
              </Button>
            </Panel>
          )}
        </div>

        <div className="relative order-1 h-72 overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-brand-soft to-surface md:order-2 md:h-[440px]">
          <div className="absolute top-3 left-3 rounded-full bg-surface/80 px-3 py-1 text-xs font-bold">Height {blocks.length}</div>
          <div className="absolute inset-x-0 bottom-0 h-4 bg-ink/80" />
          <div className="absolute inset-x-0 bottom-4 flex flex-col-reverse items-center">
            {visible.map((b) => (
              <div
                key={b.id}
                className={clsx('anim-drop h-8 w-28 rounded-md border-2 border-black/10 md:h-9 md:w-32', b.gold && 'shadow-[0_0_18px_var(--citrus)]')}
                style={{ background: b.color, transform: `translateX(${b.offset}px)` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
