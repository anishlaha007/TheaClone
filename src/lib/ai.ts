import { generate, generateJSON, streamText, filePart, type Part, type Content } from './gemini'
import { getState } from './store'
import type { Card, Concept, Kit, PodcastLine, Question, QuestionType, SummaryLength } from './types'
import { uid, shuffle, KIT_COLORS, pick } from './utils'
import type { Extracted } from './extract'

/** Keeps prompts within a sensible budget (~100k tokens of source material). */
const MAX_CONTEXT_CHARS = 400_000

function languageRule(language = getState().settings.language) {
  return language && language !== 'auto'
    ? `Write all output in ${language}.`
    : 'Write all output in the same language as the study material.'
}

function material(text: string) {
  const t = text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) + '\n\n[Material truncated for length]' : text
  return `<study_material>\n${t}\n</study_material>`
}

const TUTOR = `You are aehT, a warm, rigorous study partner for students. You build active-recall study material that is accurate, specific and faithful to the student's own material. Prefer the student's material as the source of truth; only add widely accepted background knowledge when it clearly helps. Use LaTeX between $...$ for math.`

// ---------------------------------------------------------------------------
// 1. Ingest: turn media (scans, handwriting, audio, video, YouTube, web pages)
//    into plain study text.
// ---------------------------------------------------------------------------

export async function ingestMedia(items: Extracted[], onStatus: (s: string) => void, storedPaths: Record<string, string> = {}): Promise<string> {
  const chunks: string[] = []
  for (const it of items) {
    onStatus(`Reading ${it.name}…`)
    const part = await filePart(it.file, onStatus, storedPaths[it.name])
    const kind = it.mime.startsWith('audio/') || it.mime.startsWith('video/') ? 'recording' : it.mime.startsWith('image/') ? 'image' : 'document'
    const instruction =
      kind === 'recording'
        ? 'Transcribe this lecture/recording faithfully. Then add a section "Key points" listing every concept, definition, example and formula mentioned. For video, also describe important on-screen content (slides, diagrams, equations).'
        : kind === 'image'
          ? 'Transcribe all text in this image exactly, including handwriting. Describe any diagrams, tables, graphs or equations in detail (equations in LaTeX).'
          : 'Extract the full content of this document as clean Markdown. Keep every heading, definition, example, table and formula (in LaTeX). Describe important figures. Do not summarize or skip sections.'
    const text = await generate({
      contents: [{ role: 'user', parts: [part, { text: instruction }] }],
      temperature: 0.1,
    })
    chunks.push(`# Source: ${it.name}\n\n${text.trim()}`)
  }
  return chunks.join('\n\n')
}

export async function ingestYouTube(url: string): Promise<string> {
  const text = await generate({
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: url } },
          { text: 'Produce a detailed, faithful transcript-style write-up of this video for a student: every concept, definition, example, step and formula (in LaTeX), in order, with timestamps for sections. Then list the key takeaways.' },
        ],
      },
    ],
    temperature: 0.1,
  })
  return `# Source: YouTube video ${url}\n\n${text.trim()}`
}

export async function ingestUrl(url: string): Promise<string> {
  const text = await generate({
    contents: [
      {
        role: 'user',
        parts: [{ text: `Read the web page at ${url} and reproduce its educational content as clean Markdown: all headings, explanations, definitions, examples, tables and formulas. Ignore navigation, ads and footers. If you cannot access the page, reply exactly: CANNOT_ACCESS` }],
      },
    ],
    tools: [{ url_context: {} }],
    temperature: 0.1,
  })
  if (/CANNOT_ACCESS/.test(text) || text.trim().length < 80) {
    throw new Error(`Couldn't read ${url}. Copy the page text and paste it instead.`)
  }
  return `# Source: ${url}\n\n${text.trim()}`
}

export async function writePrimer(topic: string, level: string): Promise<string> {
  const text = await generate({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write thorough study notes on: "${topic}" for a ${level} student. Cover the core concepts, key terms with definitions, important facts, worked examples, common misconceptions and how the ideas connect. Use Markdown headings. ${languageRule()}`,
          },
        ],
      },
    ],
    temperature: 0.4,
  })
  return `# Topic: ${topic}\n\n${text.trim()}`
}

// ---------------------------------------------------------------------------
// 2. Kit: title, concepts and flashcards
// ---------------------------------------------------------------------------

const S = {
  str: { type: 'STRING' },
  int: { type: 'INTEGER' },
  bool: { type: 'BOOLEAN' },
  arr: (items: object) => ({ type: 'ARRAY', items }),
  obj: (properties: Record<string, object>, required: string[]) => ({ type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties) }),
}

type KitDraft = {
  title: string
  emoji: string
  description: string
  concepts: { name: string; summary: string }[]
  flashcards: { term: string; definition: string; concept: string }[]
}

export async function draftKit(sourceText: string, cardCount: number | 'auto', language: string): Promise<Pick<Kit, 'title' | 'emoji' | 'description' | 'concepts' | 'cards' | 'color'>> {
  const countRule =
    cardCount === 'auto'
      ? 'Create as many flashcards as the material deserves (usually 12–40): one per important term, fact, formula or idea.'
      : `Create exactly ${cardCount} flashcards.`
  const draft = await generateJSON<KitDraft>({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${material(sourceText)}

Build the foundation of a study kit from the material above.
- title: short, specific (max 60 chars)
- emoji: one emoji that fits the subject
- description: one sentence on what this kit covers
- concepts: the 4–10 main concepts/topics a student must master, each with a 1–2 sentence summary
- flashcards: ${countRule} The term side is short (a word, name, formula or question); the definition side is a precise, self-contained answer (max ~40 words). Tag each card with the exact name of its concept.
${languageRule(language)}`,
          },
        ],
      },
    ],
    schema: S.obj(
      {
        title: S.str,
        emoji: S.str,
        description: S.str,
        concepts: S.arr(S.obj({ name: S.str, summary: S.str }, ['name', 'summary'])),
        flashcards: S.arr(S.obj({ term: S.str, definition: S.str, concept: S.str }, ['term', 'definition', 'concept'])),
      },
      ['title', 'emoji', 'description', 'concepts', 'flashcards'],
    ),
    temperature: 0.3,
  })

  const concepts: Concept[] = (draft.concepts || []).filter((c) => c?.name).map((c) => ({ id: uid('c'), name: c.name.trim(), summary: (c.summary || '').trim() }))
  const byName = conceptMatcher(concepts)
  const cards: Card[] = (draft.flashcards || [])
    .filter((c) => c?.term && c?.definition)
    .map((c) => ({ id: uid('f'), term: c.term.trim(), definition: c.definition.trim(), conceptId: byName(c.concept) }))
  if (!cards.length) throw new Error('Gemini could not find enough content to study. Try adding more material.')
  return {
    title: (draft.title || 'Untitled kit').slice(0, 80),
    emoji: [...(draft.emoji || '📘')].slice(0, 2).join(''),
    description: draft.description || '',
    concepts,
    cards,
    color: pick(KIT_COLORS),
  }
}

function conceptMatcher(concepts: Concept[]) {
  return (name?: string) => {
    if (!name || !concepts.length) return concepts[0]?.id
    const n = name.toLowerCase().trim()
    return (
      concepts.find((c) => c.name.toLowerCase() === n)?.id ||
      concepts.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))?.id ||
      concepts[0]?.id
    )
  }
}

// ---------------------------------------------------------------------------
// 3. Questions (Smart Study + Practice Tests)
// ---------------------------------------------------------------------------

type RawQuestion = {
  type: QuestionType
  concept: string
  difficulty: number
  prompt: string
  scenario?: string
  options?: string[]
  answerIndex?: number
  answerBool?: boolean
  answerText?: string
  accept?: string[]
  items?: string[]
  explanation: string
}

const QUESTION_SCHEMA = S.obj(
  {
    questions: S.arr(
      S.obj(
        {
          type: { type: 'STRING', enum: ['mcq', 'tf', 'fill', 'short', 'order', 'scenario'] },
          concept: S.str,
          difficulty: S.int,
          prompt: S.str,
          scenario: S.str,
          options: S.arr(S.str),
          answerIndex: S.int,
          answerBool: S.bool,
          answerText: S.str,
          accept: S.arr(S.str),
          items: S.arr(S.str),
          explanation: S.str,
        },
        ['type', 'concept', 'difficulty', 'prompt', 'explanation'],
      ),
    ),
  },
  ['questions'],
)

const TYPE_GUIDE = `Question types and required fields:
- "mcq": multiple choice. options = 4 plausible choices (distractors must be realistic misconceptions, similar length), answerIndex = index of the single correct option.
- "scenario": an applied, real-world situation. scenario = 2–4 sentence situation, prompt = the question about it, options = 4 choices, answerIndex.
- "tf": a true/false statement in prompt; answerBool. Make false statements subtly wrong, not absurd.
- "fill": prompt contains exactly one blank written as "____"; answerText = the missing word/phrase (short); accept = other acceptable spellings/synonyms.
- "short": open question needing a 1–3 sentence answer; answerText = a model answer covering the key points.
- "order": prompt asks to put steps/events/stages in order; items = 3–6 items listed in the CORRECT order.
Difficulty: 1 = recall a fact, 2 = explain/understand, 3 = apply/analyse/compare. Every question needs a concise explanation of why the answer is right (and why tempting wrong answers are wrong).`

export type QuestionRequest = {
  count: number
  concepts?: Concept[]
  focus?: { name: string; mastery: number }[]
  types?: QuestionType[]
  difficulty?: 'mixed' | 1 | 2 | 3
  avoid?: string[]
  examStyle?: boolean
}

export async function generateQuestions(kit: Kit, sourceText: string, req: QuestionRequest): Promise<Question[]> {
  const types = req.types?.length ? req.types : (['mcq', 'scenario', 'tf', 'fill', 'short', 'order'] as QuestionType[])
  const concepts = req.concepts?.length ? req.concepts : kit.concepts
  const focus = req.focus?.length
    ? `Focus mostly on these weaker concepts (mastery %): ${req.focus.map((f) => `${f.name} (${Math.round(f.mastery)}%)`).join(', ')}. Make questions harder for concepts with higher mastery.`
    : ''
  const diff = req.difficulty && req.difficulty !== 'mixed' ? `All questions should be difficulty ${req.difficulty}.` : 'Mix difficulties: roughly 35% level 1, 40% level 2, 25% level 3.'
  const avoid = req.avoid?.length ? `Do NOT repeat or trivially rephrase these existing questions:\n${req.avoid.slice(-120).map((a) => `- ${a.slice(0, 160)}`).join('\n')}` : ''
  const raw = await generateJSON<{ questions: RawQuestion[] }>({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${material(sourceText)}

Write ${req.count} high-quality ${req.examStyle ? 'exam-style ' : ''}practice questions about the material above.
Use only these types: ${types.join(', ')}. Vary the types.
Concepts (use these exact names in "concept"): ${concepts.map((c) => c.name).join(' | ')}
${focus}
${diff}
${TYPE_GUIDE}
${avoid}
${languageRule(kit.language)}`,
          },
        ],
      },
    ],
    schema: QUESTION_SCHEMA,
    temperature: 0.7,
  })
  const match = conceptMatcher(kit.concepts)
  return (raw.questions || []).map((q) => normalizeQuestion(q, match)).filter((q): q is Question => q !== null)
}

function normalizeQuestion(q: RawQuestion, match: (n?: string) => string | undefined): Question | null {
  if (!q?.prompt || !q.type) return null
  const base = {
    id: uid('q'),
    conceptId: match(q.concept),
    difficulty: (Math.min(3, Math.max(1, Math.round(q.difficulty || 1))) as 1 | 2 | 3),
    prompt: q.prompt.trim(),
    explanation: (q.explanation || '').trim(),
  }
  const opts = (q.options || []).map((o) => String(o).trim()).filter(Boolean)
  switch (q.type) {
    case 'mcq':
    case 'scenario': {
      const idx = q.answerIndex ?? -1
      if (opts.length < 2 || idx < 0 || idx >= opts.length) return null
      // Re-shuffle so the right answer isn't always in the same position.
      const order = shuffle(opts.map((_, i) => i))
      const options = order.map((i) => opts[i])
      const answer = order.indexOf(idx)
      return q.type === 'mcq' ? { ...base, type: 'mcq', options, answer } : { ...base, type: 'scenario', scenario: (q.scenario || '').trim(), options, answer }
    }
    case 'tf':
      if (typeof q.answerBool !== 'boolean') return null
      return { ...base, type: 'tf', answer: q.answerBool }
    case 'fill': {
      if (!q.answerText) return null
      const prompt = /_{2,}/.test(base.prompt) ? base.prompt.replace(/_{2,}/, '____') : `${base.prompt} ____`
      return { ...base, prompt, type: 'fill', answer: q.answerText.trim(), accept: (q.accept || []).map(String) }
    }
    case 'short':
      if (!q.answerText) return null
      return { ...base, type: 'short', answer: q.answerText.trim() }
    case 'order': {
      const items = (q.items || []).map((i) => String(i).trim()).filter(Boolean)
      if (items.length < 3) return null
      return { ...base, type: 'order', items }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 4. Grading written answers
// ---------------------------------------------------------------------------

export type Grade = { correct: boolean; score: number; feedback: string }

export async function gradeWritten(items: { question: string; modelAnswer: string; studentAnswer: string }[], language: string): Promise<Grade[]> {
  if (!items.length) return []
  const res = await generateJSON<{ grades: Grade[] }>({
    system: 'You are a fair, encouraging teacher grading short written answers. Judge meaning, not wording or spelling. Give partial credit.',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Grade each student answer against the model answer. score is 0–1; correct = score >= 0.7. feedback: one or two sentences — what was right, and what was missing or wrong. Speak directly to the student. ${languageRule(language)}

${items.map((it, i) => `#${i + 1}\nQuestion: ${it.question}\nModel answer: ${it.modelAnswer}\nStudent answer: ${it.studentAnswer || '(blank)'}`).join('\n\n')}`,
          },
        ],
      },
    ],
    schema: S.obj({ grades: S.arr(S.obj({ correct: S.bool, score: { type: 'NUMBER' }, feedback: S.str }, ['correct', 'score', 'feedback'])) }, ['grades']),
    temperature: 0.1,
  })
  return items.map((it, i) => {
    const g = res.grades?.[i]
    if (!it.studentAnswer.trim()) return { correct: false, score: 0, feedback: 'No answer given.' }
    return g ? { correct: Boolean(g.correct), score: Math.max(0, Math.min(1, Number(g.score) || 0)), feedback: g.feedback || '' } : { correct: false, score: 0, feedback: 'Could not grade this answer.' }
  })
}

// ---------------------------------------------------------------------------
// 5. Study guide, summary, podcast, chat
// ---------------------------------------------------------------------------

export function streamGuide(kit: Kit, sourceText: string, onText: (t: string) => void, signal?: AbortSignal) {
  return streamText({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${material(sourceText)}

Write a complete, exam-ready study guide for "${kit.title}" based on the material above, in Markdown:
# Title
A short overview paragraph.
## Learning objectives (bullets)
Then one ## section per major concept with: clear explanation, key terms in **bold** with definitions, worked examples, and any formulas (LaTeX). Use tables to compare related ideas where useful.
## Common mistakes & misconceptions
## Quick-review checklist (- [ ] items)
## Practice questions (5–8, with answers in a final "Answers" subsection)
Be thorough but tight; no filler. ${languageRule(kit.language)}`,
          },
        ],
      },
    ],
    temperature: 0.4,
    onText,
    signal,
  })
}

const SUMMARY_RULES: Record<SummaryLength, string> = {
  brief: 'a brief summary: a 2-sentence overview and 5–8 key bullet points',
  standard: 'a clear summary: short overview paragraph, then a section per main idea with the most important points as bullets, and a "Key terms" list',
  detailed: 'a detailed summary that keeps every important point, definition, example and formula, organised under headings',
}

export function streamSummary(kit: Kit, sourceText: string, length: SummaryLength, onText: (t: string) => void, signal?: AbortSignal) {
  return streamText({
    system: TUTOR,
    contents: [{ role: 'user', parts: [{ text: `${material(sourceText)}\n\nWrite ${SUMMARY_RULES[length]} of the material above, in Markdown. ${languageRule(kit.language)}` }] }],
    temperature: 0.3,
    onText,
    signal,
  })
}

export const HOSTS: [string, string] = ['Juno', 'Felix']

export async function writePodcast(kit: Kit, sourceText: string, minutes: number): Promise<{ title: string; lines: PodcastLine[] }> {
  const turns = Math.round(minutes * 7)
  const res = await generateJSON<{ title: string; lines: PodcastLine[] }>({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${material(sourceText)}

Write a lively two-host study podcast episode (about ${minutes} minutes, ~${turns} turns) that teaches the material above.
Hosts: ${HOSTS[0]} (curious, asks the questions students would ask) and ${HOSTS[1]} (clear explainer who uses analogies and examples).
Open with a hook, walk through every key concept in a logical order, include a quick recap and 2–3 quiz-yourself questions near the end with pauses ("think about it…") before answering.
Natural spoken language: short sentences, no Markdown, no stage directions, spell out symbols and formulas as they'd be read aloud.
Each line: speaker = "${HOSTS[0]}" or "${HOSTS[1]}". ${languageRule(kit.language)}`,
          },
        ],
      },
    ],
    schema: S.obj({ title: S.str, lines: S.arr(S.obj({ speaker: { type: 'STRING', enum: HOSTS }, text: S.str }, ['speaker', 'text'])) }, ['title', 'lines']),
    temperature: 0.8,
  })
  const lines = (res.lines || []).filter((l) => l?.text).map((l) => ({ speaker: l.speaker === HOSTS[1] ? HOSTS[1] : HOSTS[0], text: l.text.trim() }))
  if (!lines.length) throw new Error('Could not write the episode. Please try again.')
  return { title: res.title || kit.title, lines }
}

export function streamChat(kit: Kit, sourceText: string, history: { role: 'user' | 'model'; text: string }[], onText: (t: string) => void, signal?: AbortSignal) {
  const contents: Content[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] as Part[] }))
  return streamText({
    system: `${TUTOR}
You are tutoring the student on their study kit "${kit.title}". Answer using their material below; say so when something isn't covered and then answer from general knowledge. Teach, don't just tell: be concise, use examples, check understanding with a follow-up question when it helps. When asked to quiz, ask one question at a time and wait for the answer. Use Markdown. ${languageRule(kit.language)}

${material(sourceText)}`,
    contents,
    temperature: 0.6,
    onText,
    signal,
  })
}

export async function explainCard(kit: Kit, card: Card): Promise<string> {
  return generate({
    system: TUTOR,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Explain this flashcard from "${kit.title}" so it sticks: a simple explanation, an example, and a memory trick. Under 120 words, Markdown.\n\nTerm: ${card.term}\nDefinition: ${card.definition}\n${languageRule(kit.language)}` }],
      },
    ],
    temperature: 0.6,
  })
}
