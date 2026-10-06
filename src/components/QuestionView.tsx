import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react'
import type { Question, TestAnswer } from '../lib/types'
import { TYPE_LABEL } from '../lib/learning'
import { shuffle } from '../lib/utils'
import { Markdown } from './Markdown'

/**
 * Renders any question type with an answer control.
 * `reveal` shows the correct answer; `result` (true/false) colours the user's answer.
 */
export function QuestionView({
  q,
  value,
  onChange,
  reveal,
  disabled,
  onSubmit,
  compact,
}: {
  q: Question
  value: TestAnswer
  onChange: (v: TestAnswer) => void
  reveal?: boolean
  disabled?: boolean
  onSubmit?: () => void
  compact?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
        <span className="rounded-full bg-surface-2 px-2.5 py-1">{TYPE_LABEL[q.type]}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1">{['', 'Recall', 'Understand', 'Apply'][q.difficulty]}</span>
      </div>
      {q.type === 'scenario' && q.scenario && <div className="rounded-xl border-l-4 border-citrus bg-citrus-soft p-4 text-sm leading-relaxed">{q.scenario}</div>}
      <div className={clsx('font-display font-bold', compact ? 'text-lg' : 'text-xl md:text-2xl')}>
        <Markdown>{q.prompt}</Markdown>
      </div>

      {(q.type === 'mcq' || q.type === 'scenario') && (
        <div className="grid gap-2">
          {q.options.map((opt, i) => {
            const chosen = value === i
            const right = reveal && i === q.answer
            const wrong = reveal && chosen && i !== q.answer
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onChange(i)}
                className={clsx(
                  'flex items-start gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition',
                  right ? 'border-good bg-good-soft' : wrong ? 'border-bad bg-bad-soft' : chosen ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50',
                )}
              >
                <span className={clsx('grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold', chosen || right ? 'bg-ink text-bg' : 'bg-surface-2 text-muted')}>
                  {right ? <Check className="size-3.5" /> : wrong ? <X className="size-3.5" /> : String.fromCharCode(65 + i)}
                </span>
                <span className="pt-0.5">
                  <Markdown>{opt}</Markdown>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'tf' && (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((b) => {
            const chosen = value === b
            const right = reveal && q.answer === b
            const wrong = reveal && chosen && q.answer !== b
            return (
              <button
                key={String(b)}
                disabled={disabled}
                onClick={() => onChange(b)}
                className={clsx(
                  'rounded-xl border-2 p-4 font-semibold transition',
                  right ? 'border-good bg-good-soft' : wrong ? 'border-bad bg-bad-soft' : chosen ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50',
                )}
              >
                {b ? 'True' : 'False'}
              </button>
            )
          })}
        </div>
      )}

      {(q.type === 'fill' || q.type === 'short') && (
        <div className="space-y-2">
          {q.type === 'fill' ? (
            <input
              autoFocus={!compact}
              disabled={disabled}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
              placeholder="Type the missing word or phrase"
              className="w-full rounded-xl border-2 border-line bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          ) : (
            <textarea
              autoFocus={!compact}
              disabled={disabled}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit?.()}
              rows={4}
              placeholder="Write your answer in your own words"
              className="w-full resize-y rounded-xl border-2 border-line bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          )}
          {reveal && (
            <div className="rounded-xl bg-good-soft p-3 text-sm">
              <span className="font-semibold">{q.type === 'fill' ? 'Answer: ' : 'Model answer: '}</span>
              {q.answer}
            </div>
          )}
        </div>
      )}

      {q.type === 'order' && <OrderInput q={q} value={value} onChange={onChange} reveal={reveal} disabled={disabled} />}
    </div>
  )
}

function OrderInput({ q, value, onChange, reveal, disabled }: { q: Extract<Question, { type: 'order' }>; value: TestAnswer; onChange: (v: TestAnswer) => void; reveal?: boolean; disabled?: boolean }) {
  const [initial] = useState(() => {
    let s = shuffle(q.items)
    for (let i = 0; i < 5 && s.every((x, j) => x === q.items[j]); i++) s = shuffle(q.items)
    return s
  })
  const list = Array.isArray(value) && value.length === q.items.length ? (value as string[]) : initial
  useEffect(() => {
    if (!Array.isArray(value)) onChange(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  function move(i: number, d: number) {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = list.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {list.map((item, i) => {
        const right = reveal && item === q.items[i]
        const wrong = reveal && item !== q.items[i]
        return (
          <div
            key={item}
            className={clsx('flex items-center gap-3 rounded-xl border-2 bg-surface p-3 text-sm', right ? 'border-good bg-good-soft' : wrong ? 'border-bad bg-bad-soft' : 'border-line')}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold">{i + 1}</span>
            <span className="flex-1">{item}</span>
            {!disabled && (
              <span className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="size-4" />
                </button>
              </span>
            )}
          </div>
        )
      })}
      {reveal && list.some((x, i) => x !== q.items[i]) && (
        <div className="rounded-xl bg-good-soft p-3 text-sm">
          <span className="font-semibold">Correct order: </span>
          {q.items.map((x, i) => `${i + 1}. ${x}`).join('  ·  ')}
        </div>
      )}
    </div>
  )
}

export function hasAnswer(q: Question, v: TestAnswer): boolean {
  if (q.type === 'mcq' || q.type === 'scenario') return typeof v === 'number'
  if (q.type === 'tf') return typeof v === 'boolean'
  if (q.type === 'order') return Array.isArray(v)
  return typeof v === 'string' && v.trim().length > 0
}
