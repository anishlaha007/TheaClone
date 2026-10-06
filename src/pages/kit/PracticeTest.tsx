import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ClipboardCheck, Timer, Check, X, History, RotateCcw } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { getKit, recordStudy, updateKit } from '../../lib/store'
import { generateQuestions, gradeWritten } from '../../lib/ai'
import { checkObjective, TYPE_LABEL, updateMastery } from '../../lib/learning'
import { Bar, Button, ErrorBox, Panel, Segmented, Spinner } from '../../components/ui'
import { QuestionView, hasAnswer } from '../../components/QuestionView'
import { Markdown } from '../../components/Markdown'
import { formatDuration, fuzzyMatch, shuffle, uid } from '../../lib/utils'
import type { Question, QuestionType, TestAnswer, TestResult } from '../../lib/types'

const ALL_TYPES: QuestionType[] = ['mcq', 'scenario', 'tf', 'fill', 'short', 'order']

export default function PracticeTest() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [phase, setPhase] = useState<'setup' | 'loading' | 'take' | 'grading' | 'result'>('setup')
  const [count, setCount] = useState(10)
  const [minutes, setMinutes] = useState(15)
  const [types, setTypes] = useState<QuestionType[]>(ALL_TYPES)
  const [fresh, setFresh] = useState<'fresh' | 'bank'>('fresh')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<TestAnswer[]>([])
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const timeLeft = minutes ? Math.max(0, minutes * 60 - Math.floor((now - startedAt) / 1000)) : null

  useEffect(() => {
    if (phase !== 'take') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'take' && timeLeft === 0) submit(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase])

  async function begin() {
    setError(null)
    setPhase('loading')
    try {
      let qs: Question[]
      const bank = getKit(kit.id)!.questions.filter((q) => types.includes(q.type))
      if (fresh === 'bank' && bank.length >= Math.min(count, 3)) {
        qs = shuffle(bank).slice(0, count)
      } else {
        qs = await generateQuestions(getKit(kit.id)!, await getSource(), { count, types, examStyle: true, avoid: kit.questions.map((q) => q.prompt) })
        if (!qs.length) throw new Error('Could not write a test. Please try again.')
        updateKit(kit.id, (k) => ({ questions: [...k.questions, ...qs] }))
      }
      setQuestions(qs)
      setAnswers(qs.map(() => null))
      setStartedAt(Date.now())
      setNow(Date.now())
      setPhase('take')
    } catch (e) {
      setError(e)
      setPhase('setup')
    }
  }

  async function submit(auto = false) {
    if (phase !== 'take') return
    const unanswered = questions.filter((q, i) => !hasAnswer(q, answers[i])).length
    if (!auto && unanswered && !confirm(`${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) return
    setPhase('grading')
    setError(null)
    try {
      const grades = questions.map((q, i) => {
        const ok = checkObjective(q, answers[i], fuzzyMatch)
        return ok === null ? null : { correct: ok, score: ok ? 1 : 0 }
      })
      const written = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.type === 'short')
      const ai = await gradeWritten(
        written.map(({ q, i }) => ({ question: q.prompt, modelAnswer: q.type === 'short' ? q.answer : '', studentAnswer: typeof answers[i] === 'string' ? (answers[i] as string) : '' })),
        kit.language,
      )
      written.forEach(({ i }, j) => (grades[i] = ai[j]))
      const final = grades.map((g) => g || { correct: false, score: 0 })
      const score = final.reduce((a, g) => a + g.score, 0)
      const res: TestResult = {
        id: uid('t'),
        at: Date.now(),
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        score: Math.round(score * 10) / 10,
        total: questions.length,
        questions,
        answers,
        grades: final,
      }
      updateKit(kit.id, (k) => {
        const mastery = { ...k.mastery }
        questions.forEach((q, i) => {
          if (q.conceptId) mastery[q.conceptId] = updateMastery(mastery[q.conceptId], q, final[i].correct, final[i].score)
        })
        return { tests: [res, ...k.tests].slice(0, 20), mastery }
      })
      recordStudy(kit.id, questions.length, final.filter((g) => g.correct).length)
      setResult(res)
      setPhase('result')
    } catch (e) {
      setError(e)
      setPhase('take')
    }
  }

  if (phase === 'loading' || phase === 'grading') {
    return <Spinner className="justify-center py-24" label={phase === 'loading' ? 'Writing your exam…' : 'Grading your answers…'} />
  }

  if (phase === 'result' && result) return <Result result={result} onAgain={() => setPhase('setup')} />

  if (phase === 'take') {
    const answered = questions.filter((q, i) => hasAnswer(q, answers[i])).length
    return (
      <div className="space-y-5">
        <div className="sticky top-14 z-20 -mx-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-2xl md:border md:px-5">
          <span className="text-sm font-semibold">
            {answered}/{questions.length} answered
          </span>
          <div className="hidden flex-1 flex-wrap gap-1 md:flex">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className={clsx('size-7 rounded-lg text-xs font-bold', hasAnswer(q, answers[i]) ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {timeLeft !== null && (
            <span className={clsx('ml-auto flex items-center gap-1.5 font-mono text-sm font-bold', timeLeft < 60 && 'text-bad')}>
              <Timer className="size-4" /> {formatDuration(timeLeft)}
            </span>
          )}
          <Button size="sm" onClick={() => submit()} className={timeLeft === null ? 'ml-auto' : ''}>
            Submit
          </Button>
        </div>
        {error ? <ErrorBox error={error} onRetry={() => submit(true)} /> : null}
        {questions.map((q, i) => (
          <div key={q.id} ref={(el) => void (refs.current[i] = el)}>
            <Panel className="p-5 md:p-6">
              <div className="mb-2 text-xs font-bold text-muted">Question {i + 1}</div>
              <QuestionView q={q} compact value={answers[i]} onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
            </Panel>
          </div>
        ))}
        <div className="flex justify-end">
          <Button size="lg" onClick={() => submit()}>
            Submit test
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Panel className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <ClipboardCheck className="size-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Practice test</h2>
            <p className="text-sm text-muted">Simulate the real exam, then see exactly where to improve.</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Questions</div>
          <Segmented value={count} onChange={setCount} options={[5, 10, 20, 30].map((n) => ({ value: n, label: String(n) }))} />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Time limit</div>
          <Segmented value={minutes} onChange={setMinutes} options={[0, 10, 15, 30, 45, 60].map((n) => ({ value: n, label: n ? `${n} min` : 'None' }))} />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Question types</div>
          <div className="flex flex-wrap gap-2">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypes((x) => (x.includes(t) ? (x.length > 1 ? x.filter((y) => y !== t) : x) : [...x, t]))}
                className={clsx('rounded-full border px-3 py-1.5 text-sm font-medium', types.includes(t) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted')}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Questions from</div>
          <Segmented
            value={fresh}
            onChange={setFresh}
            options={[
              { value: 'fresh', label: 'New AI-written exam' },
              { value: 'bank', label: `My question bank (${kit.questions.length})` },
            ]}
          />
        </div>
        {error ? <ErrorBox error={error} onRetry={begin} /> : null}
        <Button size="lg" className="w-full" onClick={begin}>
          Start test
        </Button>
      </Panel>

      {kit.tests.length > 0 && (
        <Panel className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display font-bold">
            <History className="size-4" /> Past results
          </h3>
          <div className="space-y-2">
            {kit.tests.map((t) => {
              const pct = Math.round((t.score / t.total) * 100)
              return (
                <button key={t.id} onClick={() => (setResult(t), setPhase('result'))} className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm hover:bg-surface-2">
                  <span className={clsx('w-12 font-display text-lg font-bold', pct >= 80 ? 'text-good' : pct >= 50 ? 'text-citrus' : 'text-bad')}>{pct}%</span>
                  <span className="flex-1 text-muted">
                    {t.total} questions · {formatDuration(t.durationSec)}
                  </span>
                  <span className="text-xs text-muted">{new Date(t.at).toLocaleDateString()}</span>
                </button>
              )
            })}
          </div>
        </Panel>
      )}
    </div>
  )
}

function Result({ result, onAgain }: { result: TestResult; onAgain: () => void }) {
  const { kit } = useKitContext()
  const pct = Math.round((result.score / result.total) * 100)
  const byConcept = new Map<string, { got: number; total: number }>()
  result.questions.forEach((q, i) => {
    const k = q.conceptId || '_'
    const v = byConcept.get(k) || { got: 0, total: 0 }
    v.total++
    v.got += result.grades[i].score
    byConcept.set(k, v)
  })
  return (
    <div className="space-y-5">
      <Panel className="p-6 text-center">
        <div className={clsx('font-display text-6xl font-extrabold', pct >= 80 ? 'text-good' : pct >= 50 ? 'text-citrus' : 'text-bad')}>{pct}%</div>
        <p className="mt-2 text-muted">
          {result.score} / {result.total} points · {formatDuration(result.durationSec)}
        </p>
        <Button className="mt-5" onClick={onAgain}>
          <RotateCcw className="size-4" /> New test
        </Button>
      </Panel>
      {byConcept.size > 1 && (
        <Panel className="space-y-3 p-5">
          <h3 className="font-display font-bold">By concept</h3>
          {[...byConcept.entries()].map(([cid, v]) => {
            const name = kit.concepts.find((c) => c.id === cid)?.name || 'General'
            const p = Math.round((v.got / v.total) * 100)
            return (
              <div key={cid}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">{name}</span>
                  <span className="text-muted">{p}%</span>
                </div>
                <Bar value={p} color={p >= 80 ? 'var(--good)' : p >= 50 ? 'var(--citrus)' : 'var(--bad)'} />
              </div>
            )
          })}
        </Panel>
      )}
      {result.questions.map((q, i) => {
        const g = result.grades[i]
        return (
          <Panel key={q.id + i} className={clsx('border-l-4 p-5', g.correct ? 'border-l-good' : 'border-l-bad')}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold">
              {g.correct ? <Check className="size-4 text-good" /> : <X className="size-4 text-bad" />}
              Question {i + 1} · {TYPE_LABEL[q.type]}
              {q.type === 'short' && <span className="text-muted">({Math.round(g.score * 100)}%)</span>}
            </div>
            <QuestionView q={q} compact value={result.answers[i]} onChange={() => {}} reveal disabled />
            {g.feedback && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">{g.feedback}</p>}
            {q.explanation && (
              <div className="mt-3 text-sm text-muted">
                <Markdown>{q.explanation}</Markdown>
              </div>
            )}
          </Panel>
        )
      })}
    </div>
  )
}
