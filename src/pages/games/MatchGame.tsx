import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Trophy, RotateCcw, Timer } from 'lucide-react'
import { useKitContext } from '../kit/KitLayout'
import { getKit, recordStudy, updateKit } from '../../lib/store'
import { Button, Panel } from '../../components/ui'
import { shuffle } from '../../lib/utils'

type Tile = { key: string; cardId: string; text: string; side: 'term' | 'def' }

const PAIRS = 6

function deal(cards: { id: string; term: string; definition: string }[]): Tile[] {
  const pick = shuffle(cards).slice(0, PAIRS)
  return shuffle(pick.flatMap((c) => [
    { key: c.id + 't', cardId: c.id, text: c.term, side: 'term' as const },
    { key: c.id + 'd', cardId: c.id, text: c.definition, side: 'def' as const },
  ]))
}

export default function MatchGame() {
  const { kit } = useKitContext()
  const [tiles, setTiles] = useState<Tile[]>(() => deal(kit.cards))
  const [selected, setSelected] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState<string[]>([])
  const [start, setStart] = useState(() => Date.now())
  const [penalty, setPenalty] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [finished, setFinished] = useState<number | null>(null)
  const [best, setBest] = useState(kit.games?.matchBest)

  const pairs = tiles.length / 2
  const elapsed = (finished ?? now - start + penalty) / 1000

  useEffect(() => {
    if (finished !== null) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [finished])

  function click(t: Tile) {
    if (matched.has(t.cardId) || finished !== null) return
    if (!selected) return setSelected(t.key)
    if (selected === t.key) return setSelected(null)
    const first = tiles.find((x) => x.key === selected)!
    if (first.cardId === t.cardId && first.side !== t.side) {
      const next = new Set(matched).add(t.cardId)
      setMatched(next)
      setSelected(null)
      if (next.size === pairs) {
        const total = Date.now() - start + penalty
        setFinished(total)
        recordStudy(kit.id, pairs, pairs)
        const prev = getKit(kit.id)?.games?.matchBest
        if (!prev || total < prev) {
          setBest(total)
          updateKit(kit.id, (k) => ({ games: { ...k.games, matchBest: total } }))
        }
      }
    } else {
      setWrong([selected, t.key])
      setPenalty((p) => p + 1000)
      setSelected(null)
      setTimeout(() => setWrong([]), 450)
    }
  }

  function restart() {
    setTiles(deal(kit.cards))
    setMatched(new Set())
    setSelected(null)
    setPenalty(0)
    setStart(Date.now())
    setNow(Date.now())
    setFinished(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Definition Match</h2>
        <div className="flex items-center gap-4 text-sm font-semibold">
          <span className="flex items-center gap-1.5 font-mono text-lg">
            <Timer className="size-4" /> {elapsed.toFixed(1)}s
          </span>
          {penalty > 0 && <span className="text-bad">+{penalty / 1000}s</span>}
        </div>
      </div>

      {finished !== null ? (
        <Panel className="anim-pop p-8 text-center">
          <Trophy className="mx-auto size-12 text-citrus" />
          <h3 className="mt-3 font-display text-3xl font-extrabold">{elapsed.toFixed(1)} seconds</h3>
          <p className="mt-1 text-muted">{best === finished ? 'New personal best!' : best ? `Personal best: ${(best / 1000).toFixed(1)}s` : ''}</p>
          <Button className="mt-5" onClick={restart}>
            <RotateCcw className="size-4" /> Play again
          </Button>
        </Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {tiles.map((t) => {
            const done = matched.has(t.cardId)
            return (
              <button
                key={t.key}
                onClick={() => click(t)}
                className={clsx(
                  'flex min-h-28 items-center justify-center rounded-2xl border-2 p-3 text-center text-sm transition',
                  done && 'scale-95 border-transparent bg-transparent opacity-0',
                  !done && selected === t.key && 'border-brand bg-brand-soft',
                  !done && wrong.includes(t.key) && 'anim-shake border-bad bg-bad-soft',
                  !done && selected !== t.key && !wrong.includes(t.key) && 'border-line bg-surface hover:border-brand/50',
                  t.side === 'term' && 'font-display text-base font-bold',
                )}
              >
                <span className="line-clamp-5">{t.text}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
