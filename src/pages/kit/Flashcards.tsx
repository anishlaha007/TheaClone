import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Shuffle, Star, Volume2, Sparkles, RotateCcw, Check, X, Repeat, PartyPopper } from 'lucide-react'
import { useKitContext } from './KitLayout'
import { recordStudy, updateKit } from '../../lib/store'
import { dueCards, nextIntervalLabel, review, type Rating } from '../../lib/learning'
import { explainCard } from '../../lib/ai'
import { Bar, Button, ErrorBox, Kbd, Panel, Segmented, Spinner, EmptyState, LinkButton } from '../../components/ui'
import { Markdown } from '../../components/Markdown'
import { shuffle, speak } from '../../lib/utils'
import type { Card } from '../../lib/types'

function FlipCard({ card, flipped, onFlip, front }: { card: Card; flipped: boolean; onFlip: () => void; front: 'term' | 'definition' }) {
  const a = front === 'term' ? card.term : card.definition
  const b = front === 'term' ? card.definition : card.term
  return (
    <div className="flip-scene h-72 w-full cursor-pointer select-none md:h-80" onClick={onFlip}>
      <div className={clsx('flip-card relative h-full w-full', flipped && 'is-flipped')}>
        <div className="flip-face absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">{front === 'term' ? 'Term' : 'Definition'}</span>
          <div className={clsx('m-auto max-h-full overflow-y-auto text-center', a.length < 60 ? 'font-display text-3xl font-bold' : 'text-lg')}>
            <Markdown>{a}</Markdown>
          </div>
          <span className="text-center text-xs text-muted">Click or press space to flip</span>
        </div>
        <div className="flip-face flip-back absolute inset-0 flex flex-col rounded-3xl border border-brand/30 bg-brand-soft p-6 shadow-sm">
          <span className="text-xs font-bold tracking-wide text-brand uppercase">{front === 'term' ? 'Definition' : 'Term'}</span>
          <div className={clsx('m-auto max-h-full overflow-y-auto text-center', b.length < 60 ? 'font-display text-3xl font-bold' : 'text-lg')}>
            <Markdown>{b}</Markdown>
          </div>
        </div>
      </div>
    </div>
  )
}

function Browse() {
  const { kit } = useKitContext()
  const [starredOnly, setStarredOnly] = useState(false)
  const [front, setFront] = useState<'term' | 'definition'>('term')
  const [order, setOrder] = useState<string[]>(() => kit.cards.map((c) => c.id))
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [explain, setExplain] = useState<{ id: string; text?: string; error?: unknown } | null>(null)
  const [sorting, setSorting] = useState(false)

  const byId = useMemo(() => new Map(kit.cards.map((c) => [c.id, c])), [kit.cards])
  const deck = order.map((id) => byId.get(id)).filter((c): c is Card => !!c && (!starredOnly || !!c.starred) && (!sorting || !c.known))
  const card = deck[Math.min(i, deck.length - 1)]

  useEffect(() => {
    // Include newly added cards.
    setOrder((o) => [...o.filter((id) => byId.has(id)), ...kit.cards.filter((c) => !o.includes(c.id)).map((c) => c.id)])
  }, [kit.cards, byId])

  function go(d: number) {
    setFlipped(false)
    setExplain(null)
    setI((x) => Math.max(0, Math.min(deck.length - 1, x + d)))
  }

  function mark(known: boolean) {
    if (!card) return
    updateKit(kit.id, (k) => ({ cards: k.cards.map((c) => (c.id === card.id ? { ...c, known } : c)) }))
    recordStudy(kit.id)
    setFlipped(false)
    if (!sorting || !known) go(1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ') (e.preventDefault(), setFlipped((f) => !f))
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (sorting && e.key === '1') mark(false)
      if (sorting && e.key === '2') mark(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const knownCount = kit.cards.filter((c) => c.known).length

  if (!card) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-7" />}
        title={sorting ? 'You know every card!' : 'No cards here'}
        body={sorting ? 'Every card is sorted into "Know it". Reset to go again.' : 'Try turning off the starred filter.'}
        action={
          sorting ? (
            <Button onClick={() => updateKit(kit.id, (k) => ({ cards: k.cards.map((c) => ({ ...c, known: false })) }))}>
              <RotateCcw className="size-4" /> Reset progress
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={front} onChange={setFront} options={[{ value: 'term', label: 'Term first' }, { value: 'definition', label: 'Definition first' }]} />
        <Button variant={sorting ? 'primary' : 'secondary'} size="sm" onClick={() => (setSorting((s) => !s), setI(0))}>
          <Repeat className="size-4" /> {sorting ? 'Sorting on' : 'Sort cards'}
        </Button>
        <Button variant={starredOnly ? 'primary' : 'secondary'} size="sm" onClick={() => (setStarredOnly((s) => !s), setI(0))}>
          <Star className="size-4" /> Starred
        </Button>
        <Button variant="secondary" size="sm" onClick={() => (setOrder(shuffle(order)), setI(0), setFlipped(false))}>
          <Shuffle className="size-4" /> Shuffle
        </Button>
      </div>

      {sorting && (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-bad">{kit.cards.length - knownCount} learning</span>
          <Bar value={(knownCount / Math.max(1, kit.cards.length)) * 100} color="var(--good)" />
          <span className="font-semibold text-good">{knownCount} known</span>
        </div>
      )}

      <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} front={front} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => updateKit(kit.id, (k) => ({ cards: k.cards.map((c) => (c.id === card.id ? { ...c, starred: !c.starred } : c)) }))}
            className={clsx('rounded-xl p-2.5 hover:bg-surface-2', card.starred ? 'text-citrus' : 'text-muted')}
            aria-label="Star card"
          >
            <Star className={clsx('size-5', card.starred && 'fill-current')} />
          </button>
          <button onClick={() => speak(flipped === (front === 'term') ? card.definition : card.term)} className="rounded-xl p-2.5 text-muted hover:bg-surface-2" aria-label="Read aloud">
            <Volume2 className="size-5" />
          </button>
          <button
            onClick={async () => {
              setExplain({ id: card.id })
              try {
                setExplain({ id: card.id, text: await explainCard(kit, card) })
              } catch (error) {
                setExplain({ id: card.id, error })
              }
            }}
            className="rounded-xl p-2.5 text-muted hover:bg-surface-2"
            aria-label="Explain with AI"
            title="Explain with AI"
          >
            <Sparkles className="size-5" />
          </button>
        </div>
        {sorting ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="!border-bad/40 !text-bad" onClick={() => mark(false)}>
              <X className="size-4" /> Still learning
            </Button>
            <Button variant="secondary" className="!border-good/40 !text-good" onClick={() => mark(true)}>
              <Check className="size-4" /> Know it
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => go(-1)} disabled={i === 0} className="rounded-xl border border-line bg-surface p-2.5 disabled:opacity-40" aria-label="Previous">
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-14 text-center text-sm font-semibold">
              {Math.min(i, deck.length - 1) + 1} / {deck.length}
            </span>
            <button onClick={() => go(1)} disabled={i >= deck.length - 1} className="rounded-xl border border-line bg-surface p-2.5 disabled:opacity-40" aria-label="Next">
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>

      {explain && explain.id === card.id && (
        <Panel className="anim-pop p-5">
          {explain.error ? <ErrorBox error={explain.error} /> : explain.text ? <Markdown>{explain.text}</Markdown> : <Spinner label="Thinking…" />}
        </Panel>
      )}

      <p className="hidden text-center text-xs text-muted md:block">
        <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> navigate {sorting && <>· <Kbd>1</Kbd> still learning · <Kbd>2</Kbd> know it</>}
      </p>
    </div>
  )
}

function Review() {
  const { kit } = useKitContext()
  const [queue, setQueue] = useState<string[]>(() => shuffle(dueCards(kit.cards).map((c) => c.id)))
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const card = kit.cards.find((c) => c.id === queue[0])

  function rate(r: Rating) {
    if (!card) return
    const srs = review(card.srs, r)
    updateKit(kit.id, (k) => ({ cards: k.cards.map((c) => (c.id === card.id ? { ...c, srs, known: r !== 'again' ? true : c.known } : c)) }))
    recordStudy(kit.id, 1, r === 'again' ? 0 : 1)
    setFlipped(false)
    setDone((d) => d + 1)
    // "Again" cards come back later in this session.
    setQueue((q) => (r === 'again' ? [...q.slice(1), q[0]] : q.slice(1)))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') (e.preventDefault(), setFlipped((f) => !f))
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate((['again', 'hard', 'good', 'easy'] as Rating[])[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) {
    const next = kit.cards.filter((c) => c.srs).sort((a, b) => a.srs!.due - b.srs!.due)[0]
    return (
      <EmptyState
        icon={<PartyPopper className="size-7" />}
        title={done ? `Reviewed ${done} cards. All caught up!` : 'Nothing due right now'}
        body={next ? `Your next card is due ${new Date(next.srs!.due).toLocaleString()}.` : 'Come back later. Spaced repetition brings each card back right before you’d forget it.'}
        action={<LinkButton to={`/kit/${kit.id}/smart`}>Try Smart Study</LinkButton>}
      />
    )
  }

  const ratings: { r: Rating; label: string; cls: string }[] = [
    { r: 'again', label: 'Again', cls: '!text-bad !border-bad/40' },
    { r: 'hard', label: 'Hard', cls: '!text-citrus !border-citrus/50' },
    { r: 'good', label: 'Good', cls: '!text-brand !border-brand/40' },
    { r: 'easy', label: 'Easy', cls: '!text-good !border-good/40' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Bar value={(done / Math.max(1, done + queue.length)) * 100} />
        <span className="shrink-0 font-semibold text-muted">{queue.length} left</span>
      </div>
      <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} front="term" />
      {flipped ? (
        <div className="grid grid-cols-4 gap-2">
          {ratings.map((x, idx) => (
            <Button key={x.r} variant="secondary" className={clsx('flex-col !gap-0.5', x.cls)} onClick={() => rate(x.r)}>
              <span>{x.label}</span>
              <span className="text-[11px] font-normal text-muted">
                {nextIntervalLabel(card.srs, x.r)} · {idx + 1}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={() => setFlipped(true)}>
          Show answer
        </Button>
      )}
    </div>
  )
}

export default function Flashcards() {
  const { kit } = useKitContext()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'review' ? 'review' : 'browse'
  const due = dueCards(kit.cards).length

  if (!kit.cards.length) {
    return <EmptyState icon={<Star className="size-7" />} title="No flashcards yet" body="Add some cards to start studying." action={<LinkButton to={`/kit/${kit.id}/cards`}>Add cards</LinkButton>} />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Segmented
        value={mode}
        onChange={(m) => setParams(m === 'review' ? { mode: 'review' } : {})}
        options={[
          { value: 'browse', label: 'Study cards' },
          { value: 'review', label: `Spaced review${due ? ` (${due})` : ''}` },
        ]}
      />
      {mode === 'review' ? <Review key="r" /> : <Browse key="b" />}
    </div>
  )
}
