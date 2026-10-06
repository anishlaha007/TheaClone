export type SrsState = {
  /** SM-2 ease factor */
  ease: number
  /** interval in days */
  interval: number
  reps: number
  lapses: number
  /** epoch ms when the card is next due */
  due: number
}

export type Card = {
  id: string
  term: string
  definition: string
  conceptId?: string
  starred?: boolean
  /** "know" / "learning" sorting used by the classic flashcard mode */
  known?: boolean
  srs?: SrsState
}

export type Concept = {
  id: string
  name: string
  summary: string
}

export type QuestionType = 'mcq' | 'tf' | 'fill' | 'short' | 'order' | 'scenario'

export type QuestionBase = {
  id: string
  conceptId?: string
  /** 1 = recall, 2 = understanding, 3 = application */
  difficulty: 1 | 2 | 3
  prompt: string
  explanation: string
  stats?: { seen: number; correct: number; lastSeen?: number; lastCorrect?: boolean }
}

export type McqQuestion = QuestionBase & { type: 'mcq'; options: string[]; answer: number }
export type ScenarioQuestion = QuestionBase & { type: 'scenario'; scenario: string; options: string[]; answer: number }
export type TfQuestion = QuestionBase & { type: 'tf'; answer: boolean }
export type FillQuestion = QuestionBase & { type: 'fill'; answer: string; accept: string[] }
export type ShortQuestion = QuestionBase & { type: 'short'; answer: string }
export type OrderQuestion = QuestionBase & { type: 'order'; items: string[] }

export type Question = McqQuestion | ScenarioQuestion | TfQuestion | FillQuestion | ShortQuestion | OrderQuestion

export type SourceMeta = {
  kind: 'file' | 'text' | 'youtube' | 'url' | 'topic'
  name: string
  mime?: string
  chars?: number
  /** original file in the user's private "sources" bucket */
  storagePath?: string
}

export type ChatMessage = { role: 'user' | 'model'; text: string; at: number }

export type PodcastLine = { speaker: string; text: string }

export type Podcast = {
  title: string
  hosts: [string, string]
  lines: PodcastLine[]
  /** true when a generated audio file is stored in IndexedDB under podcastAudioKey(kitId) */
  hasAudio?: boolean
  createdAt: number
}

export type TestAnswer = number | boolean | string | string[] | null

export type TestResult = {
  id: string
  at: number
  durationSec: number
  score: number
  total: number
  questions: Question[]
  answers: TestAnswer[]
  grades: { correct: boolean; score: number; feedback?: string }[]
}

export type Kit = {
  id: string
  title: string
  description: string
  emoji: string
  color: string
  folderId?: string
  language: string
  createdAt: number
  updatedAt: number
  lastStudiedAt?: number
  sources: SourceMeta[]
  /** Extracted text of all source material. Loaded lazily (see ensureSourceText). */
  sourceText?: string
  concepts: Concept[]
  cards: Card[]
  questions: Question[]
  /** concept id -> mastery 0..100 */
  mastery: Record<string, number>
  guide?: string
  summary?: { length: SummaryLength; text: string }
  podcast?: Podcast
  chat: ChatMessage[]
  tests: TestResult[]
  games?: { matchBest?: number; stackerBest?: number; builderBest?: number }
}

export type SummaryLength = 'brief' | 'standard' | 'detailed'

export type Folder = { id: string; name: string; createdAt: number }

export type Theme = 'system' | 'light' | 'dark'

export type Settings = {
  /** Optional personal Gemini key, kept only in this browser. Empty = use the app's server key. */
  apiKey: string
  model: string
  ttsModel: string
  language: string
  theme: Theme
  questionsPerRound: number
  name: string
}

/** Days (YYYY-MM-DD, local time) on which the user studied. */
export type Activity = { days: string[]; answered: number; correct: number }
