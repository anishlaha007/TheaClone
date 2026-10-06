import type { Card, Kit, Question, SrsState } from './types'
import { shuffle } from './utils'

// ---------------------------------------------------------------------------
// Spaced repetition (SM-2 variant) for flashcards
// ---------------------------------------------------------------------------

export type Rating = 'again' | 'hard' | 'good' | 'easy'
const DAY = 86_400_000

export function newSrs(): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0 }
}

export function review(srs: SrsState | undefined, rating: Rating, now = Date.now()): SrsState {
  const s = srs ?? newSrs()
  if (rating === 'again') {
    return { ease: Math.max(1.3, s.ease - 0.2), interval: 0, reps: 0, lapses: s.lapses + 1, due: now + 60_000 }
  }
  const q = rating === 'hard' ? 3 : rating === 'good' ? 4 : 5
  const ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  let interval: number
  if (s.reps === 0) interval = rating === 'easy' ? 3 : rating === 'good' ? 1 : 0.5
  else if (s.reps === 1) interval = rating === 'easy' ? 6 : rating === 'good' ? 3 : 1.5
  else interval = s.interval * (rating === 'hard' ? 1.2 : rating === 'easy' ? ease * 1.3 : ease)
  interval = Math.min(365, interval)
  return { ease, interval, reps: s.reps + 1, lapses: s.lapses, due: now + interval * DAY }
}

export function nextIntervalLabel(srs: SrsState | undefined, rating: Rating): string {
  const r = review(srs, rating, 0)
  const ms = r.due
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < DAY) return `${Math.round(ms / 3_600_000)}h`
  const d = ms / DAY
  if (d < 30) return `${Math.round(d)}d`
  if (d < 365) return `${Math.round(d / 30)}mo`
  return `${Math.round(d / 365)}y`
}

export function dueCards(cards: Card[], now = Date.now()): Card[] {
  return cards.filter((c) => !c.srs || c.srs.due <= now)
}

// ---------------------------------------------------------------------------
// Mastery for Smart Study
// ---------------------------------------------------------------------------

export const MASTERY_LEVELS = [
  { min: 0, label: 'New', color: 'var(--muted)' },
  { min: 1, label: 'Learning', color: 'var(--bad)' },
  { min: 35, label: 'Familiar', color: 'var(--citrus)' },
  { min: 65, label: 'Proficient', color: 'var(--brand)' },
  { min: 90, label: 'Mastered', color: 'var(--good)' },
]

export function masteryLevel(m: number | undefined) {
  const v = m ?? 0
  let lvl = MASTERY_LEVELS[0]
  for (const l of MASTERY_LEVELS) if (v >= l.min) lvl = l
  return lvl
}

export function kitMastery(kit: Kit): number {
  if (!kit.concepts.length) {
    if (!kit.cards.length) return 0
    const known = kit.cards.filter((c) => c.known || (c.srs && c.srs.reps >= 2)).length
    return Math.round((known / kit.cards.length) * 100)
  }
  const sum = kit.concepts.reduce((a, c) => a + (kit.mastery[c.id] ?? 0), 0)
  return Math.round(sum / kit.concepts.length)
}

/** Mastery change after answering a question. Harder questions move mastery more. */
export function updateMastery(current: number | undefined, q: Question, correct: boolean, partial = 0): number {
  const m = current ?? 0
  const weight = q.difficulty === 3 ? 1.4 : q.difficulty === 2 ? 1.15 : 1
  let next: number
  if (correct) {
    // Diminishing returns near the top; level-1 questions alone can't reach "Mastered".
    const cap = q.difficulty === 1 ? 80 : 100
    next = m + Math.max(3, (cap - m) * 0.28 * weight)
    next = Math.min(cap, next)
    if (m > cap) next = m
  } else {
    next = m - (12 + m * 0.12) * (1 - partial)
  }
  return Math.max(1, Math.min(100, Math.round(next)))
}

function targetDifficulty(m: number): 1 | 2 | 3 {
  return m < 35 ? 1 : m < 70 ? 2 : 3
}

/**
 * Picks the next round of questions: weakest concepts first, at a difficulty
 * that matches the student's mastery; unseen or previously missed questions
 * preferred, recently answered ones avoided.
 */
export function pickRound(kit: Kit, size: number): Question[] {
  const now = Date.now()
  const scored = kit.questions.map((q) => {
    const m = q.conceptId ? (kit.mastery[q.conceptId] ?? 0) : 50
    const st = q.stats
    let score = (100 - m) * 1.2
    score -= Math.abs(q.difficulty - targetDifficulty(m)) * 25
    if (!st || st.seen === 0) score += 30
    else if (st.lastCorrect === false) score += 45
    else score -= 20 + st.correct * 10
    if (st?.lastSeen && now - st.lastSeen < 10 * 60_000) score -= 60
    score += Math.random() * 25
    return { q, score }
  })
  scored.sort((a, b) => b.score - a.score)
  // Keep concept variety: at most ~40% of a round from one concept.
  const perConcept = new Map<string, number>()
  const out: Question[] = []
  const limit = Math.max(2, Math.ceil(size * 0.4))
  for (const { q } of scored) {
    const k = q.conceptId || '_'
    if ((perConcept.get(k) || 0) >= limit) continue
    perConcept.set(k, (perConcept.get(k) || 0) + 1)
    out.push(q)
    if (out.length >= size) break
  }
  if (out.length < size) {
    for (const { q } of scored) {
      if (!out.includes(q)) out.push(q)
      if (out.length >= size) break
    }
  }
  return shuffle(out)
}

/** How many fresh (unseen or missed) questions remain for concepts that still need work. */
export function freshQuestionCount(kit: Kit): number {
  return kit.questions.filter((q) => {
    const m = q.conceptId ? (kit.mastery[q.conceptId] ?? 0) : 0
    return m < 90 && (!q.stats || q.stats.seen === 0 || q.stats.lastCorrect === false)
  }).length
}

export function weakestConcepts(kit: Kit, n = 4) {
  return [...kit.concepts]
    .map((c) => ({ ...c, mastery: kit.mastery[c.id] ?? 0 }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, n)
}

/** Checks an objective answer locally. Written ("short") answers are graded by AI. */
export function checkObjective(q: Question, answer: unknown, fuzzy: (given: string, accepted: string[]) => boolean): boolean | null {
  switch (q.type) {
    case 'mcq':
    case 'scenario':
      return answer === q.answer
    case 'tf':
      return answer === q.answer
    case 'fill':
      return typeof answer === 'string' && fuzzy(answer, [q.answer, ...q.accept])
    case 'order':
      return Array.isArray(answer) && answer.length === q.items.length && answer.every((a, i) => a === q.items[i])
    case 'short':
      return null
  }
}

export const TYPE_LABEL: Record<Question['type'], string> = {
  mcq: 'Multiple choice',
  scenario: 'Scenario',
  tf: 'True or false',
  fill: 'Fill in the blank',
  short: 'Written answer',
  order: 'Put in order',
}
