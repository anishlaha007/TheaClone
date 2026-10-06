import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Brain, Check, X, Sparkles, Trophy, ArrowRight, RotateCcw } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { getKit, getState, recordStudy, updateKit } from '../../lib/store'
import { checkObjective, freshQuestionCount, masteryLevel, pickRound, updateMastery, weakestConcepts } from '../../lib/learning'
import { generateQuestions, gradeWritten } from '../../lib/ai'
import { Bar, Button, ErrorBox, Panel, Spinner, Kbd } from '../../components/ui'
import { QuestionView, hasAnswer } from '../../components/QuestionView'
import { Markdown } from '../../components/Markdown'
import { fuzzyMatch } from '../../lib/utils'
import type { Kit, Question, TestAnswer } from '../../lib/types'

type Feedback = { correct: boolean; partial?: number; text?: string }

async function topUp(kit: Kit, source: string, count: number) {
  const weak = weakestConcepts(kit, 4)
  const fresh = await generateQuestions(kit, source, {
    count,
    focus: weak.map((c) => ({ name: c.name, mastery: c.mastery })),
    avoid: kit.questions.map((q) => q.prompt),
  })
  updateKit(kit.id, (k) => ({ questions: [...k.questions, ...fresh] }))
  return fresh.length
}

export default function SmartStudy() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const roundSize = getState().settings.questionsPerRound
  const [phase, setPhase] = useState<'start' | 'play' | 'done'>('start')
  const [queue, setQueue] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [answer, setAnswer] = useState<TestAnswer>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState<{ q: Question; correct: boolean }[]>([])
  const [before, setBefore] = useState<Record<string, number>>({})
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requeued = useRef(new Set<string>())

  const q = queue[idx]

  async function ensureBank(min: number) {
    const k = getKit(kit.id)!
    if (freshQuestionCount(k) >= min) return
    setGenerating(true)
    try {
      await topUp(k, await getSource(), Math.max(12, min))
    } finally {
      setGenerating(false)
    }
  }

  async function start() {
    setError(null)
    try {
      if (!getKit(kit.id)!.questions.length) await ensureBank(roundSize)
      const k = getKit(kit.id)!
      if (!k.questions.length) throw new Error('No questions yet. Add more material to this kit.')
      setQueue(pickRound(k, roundSize))
      setIdx(0)
      setResults([])
      setBefore({ ...k.mastery })
      setAnswer(null)
      setFeedback(null)
      requeued.current = new Set()
      setPhase('play')
      // Quietly write fresh questions for next time when the bank is running low.
      if (freshQuestionCount(k) < roundSize * 1.5) {
        getSource()
          .then((src) => topUp(getKit(kit.id)!, src, 12))
          .catch(() => {})
      }
    } catch (e) {
      setError(e)
    }
  }

  async function check() {
    if (!q || !hasAnswer(q, answer) || feedback) return
    setChecking(true)
    setError(null)
    try {
      let fb: Feedback
      const local = checkObjective(q, answer, fuzzyMatch)
      if (local !== null) fb = { correct: local }
      else {
        const [g] = await gradeWritten([{ question: q.prompt, modelAnswer: q.type === 'short' ? q.answer : '', studentAnswer: String(answer) }], kit.language)
        fb = { correct: g.correct, partial: g.score, text: g.feedback }
      }
      setFeedback(fb)
      apply(fb.correct, fb.partial)
    } catch (e) {
      setError(e)
    } finally {
      setChecking(false)
    }
  }

  function apply(correct: boolean, partial = 0, undo = false) {
    updateKit(kit.id, (k) => ({
      questions: k.questions.map((x) =>
        x.id === q.id
          ? {
              ...x,
              stats: {
                seen: (x.stats?.seen || 0) + (undo ? 0 : 1),
                correct: (x.stats?.correct || 0) + (correct ? 1 : undo ? -1 : 0),
                lastSeen: Date.now(),
                lastCorrect: correct,
              },
            }
          : x,
      ),
      mastery: q.conceptId ? { ...k.mastery, [q.conceptId]: updateMastery(k.mastery[q.conceptId], q, correct, partial) } : k.mastery,
    }))
    if (!undo) recordStudy(kit.id, 1, correct ? 1 : 0)
    setResults((r) => (undo ? r.map((x, i) => (i === r.length - 1 ? { ...x, correct } : x)) : [...r, { q, correct }]))
  }

  function overrideCorrect() {
    // "I was right": e.g. a valid synonym for a fill-in-the-blank.
    setFeedback({ correct: true, text: 'Marked as correct.' })
    apply(true, 0, true)
  }

  function next() {
    if (!feedback) return
    let nextQueue = queue
    if (!feedback.correct && !requeued.current.has(q.id)) {
      // Missed questions come back at the end of the round.
      requeued.current.add(q.id)
      nextQueue = [...queue, q]
      setQueue(nextQueue)
    }
    if (idx + 1 >= nextQueue.length) {
      setPhase('done')
      return
    }
    setIdx(idx + 1)
    setAnswer(null)
    setFeedback(null)
  }

  useEffect(() => {
    if (phase !== 'play') return
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'Enter' && !e.shiftKey && (!typing || feedback)) {
        e.preventDefault()
        if (feedback) next()
        else check()
      }
      if (!feedback && !typing && q && (q.type === 'mcq' || q.type === 'scenario')) {
        const n = Number(e.key)
        if (n >= 1 && n <= q.options.length) setAnswer(n - 1)
      }
      if (!feedback && !typing && q?.type === 'tf') {
        if (e.key.toLowerCase() === 't') setAnswer(true)
        if (e.key.toLowerCase() === 'f') setAnswer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'start') {
    const weak = weakestConcepts(kit, 3)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Panel className="p-6 text-center md:p-8">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Brain className="size-7" />
          </div>
          <h2 className="font-display text-2xl font-bold">Smart Study</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Rounds of {roundSize} questions that target your weakest concepts. Questions get harder as your mastery grows, and anything you miss comes back.
          </p>
          <Button size="lg" className="mt-6" onClick={start} loading={generating}>
            {generating ? 'Writing questions…' : 'Start a round'}
          </Button>
          {error ? <div className="mt-4 text-left"><ErrorBox error={error} onRetry={start} /></div> : null}
        </Panel>
        {weak.length > 0 && (
          <Panel className="p-5">
            <h3 className="mb-3 text-sm font-bold text-muted">Focus areas</h3>
            <div className="space-y-3">
              {weak.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-muted">{c.mastery}%</span>
                  </div>
                  <Bar value={c.mastery} color={masteryLevel(c.mastery).color} />
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    const k = getKit(kit.id)!
    const correct = results.filter((r) => r.correct).length
    const pct = results.length ? Math.round((correct / results.length) * 100) : 0
    const touched = [...new Set(results.map((r) => r.q.conceptId).filter(Boolean))] as string[]
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Panel className="p-6 text-center md:p-8">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-citrus-soft text-citrus">
            <Trophy className="size-7" />
          </div>
          <h2 className="font-display text-3xl font-extrabold">{pct >= 80 ? 'Excellent round!' : pct >= 50 ? 'Solid progress' : 'Good effort, keep going'}</h2>
          <p className="mt-2 text-muted">
            {correct} of {results.length} answers correct ({pct}%)
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={start} loading={generating}>
              <RotateCcw className="size-4" /> Next round
            </Button>
            <Button
              variant="secondary"
              loading={generating}
              onClick={async () => {
                setError(null)
                setGenerating(true)
                try {
                  await topUp(getKit(kit.id)!, await getSource(), 12)
                } catch (e) {
                  setError(e)
                } finally {
                  setGenerating(false)
                }
              }}
            >
              <Sparkles className="size-4" /> Write new questions
            </Button>
          </div>
          {error ? <div className="mt-4 text-left"><ErrorBox error={error} /></div> : null}
        </Panel>
        {touched.length > 0 && (
          <Panel className="p-5">
            <h3 className="mb-4 text-sm font-bold text-muted">Mastery this round</h3>
            <div className="space-y-4">
              {touched.map((cid) => {
                const c = k.concepts.find((x) => x.id === cid)
                if (!c) return null
                const now = k.mastery[cid] ?? 0
                const was = before[cid] ?? 0
                const lvl = masteryLevel(now)
                return (
                  <div key={cid}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{c.name}</span>
                      <span style={{ color: lvl.color }} className="font-semibold">
                        {lvl.label} {now}% <span className={now >= was ? 'text-good' : 'text-bad'}>({now >= was ? '+' : ''}{now - was})</span>
                      </span>
                    </div>
                    <Bar value={now} color={lvl.color} />
                  </div>
                )
              })}
            </div>
          </Panel>
        )}
      </div>
    )
  }

  if (!q) return <Spinner label="Loading…" />

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Bar value={(idx / queue.length) * 100} />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {idx + 1}/{queue.length}
        </span>
      </div>
      <Panel className={clsx('p-5 md:p-7', feedback && !feedback.correct && 'anim-shake')}>
        <QuestionView key={q.id + idx} q={q} value={answer} onChange={setAnswer} reveal={!!feedback} disabled={!!feedback} onSubmit={check} />
      </Panel>

      {error ? <ErrorBox error={error} onRetry={check} /> : null}

      {feedback ? (
        <div className={clsx('anim-pop rounded-2xl border p-5', feedback.correct ? 'border-good/30 bg-good-soft' : 'border-bad/30 bg-bad-soft')}>
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            {feedback.correct ? <Check className="size-5 text-good" /> : <X className="size-5 text-bad" />}
            {feedback.correct ? 'Correct!' : feedback.partial && feedback.partial > 0.3 ? 'Partly right' : 'Not quite'}
          </div>
          {feedback.text && <p className="mt-2 text-sm">{feedback.text}</p>}
          {q.explanation && (
            <div className="mt-2 text-sm">
              <Markdown>{q.explanation}</Markdown>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={next}>
              Continue <ArrowRight className="size-4" />
            </Button>
            {!feedback.correct && q.type !== 'mcq' && q.type !== 'scenario' && q.type !== 'tf' && (
              <Button variant="ghost" onClick={overrideCorrect}>
                I was right
              </Button>
            )}
            <span className="ml-auto hidden text-xs text-muted sm:block">
              <Kbd>Enter</Kbd> to continue
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button size="lg" onClick={check} disabled={!hasAnswer(q, answer)} loading={checking}>
            Check answer
          </Button>
          <button className="text-sm text-muted hover:text-ink" onClick={() => (setFeedback({ correct: false, text: "Skipped. Here's the answer." }), apply(false))}>
            I don't know
          </button>
        </div>
      )}
    </div>
  )
}
