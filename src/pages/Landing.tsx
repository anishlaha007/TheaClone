import { Link } from 'react-router-dom'
import { Brain, Layers, ClipboardCheck, BookOpen, Headphones, Gamepad2, MessageCircle, Upload, Sparkles } from 'lucide-react'
import { GitHubIcon } from '../components/icons'
import { Logo } from '../components/ui'

const features = [
  { icon: Brain, title: 'Smart Study', body: 'Adaptive questions that chase your weak spots and get harder as your mastery grows.' },
  { icon: Layers, title: 'Flashcards', body: 'Flip, sort and review with built-in spaced repetition so cards come back right before you forget.' },
  { icon: ClipboardCheck, title: 'Practice tests', body: 'Timed, exam-style tests with written answers graded by AI and a breakdown by topic.' },
  { icon: BookOpen, title: 'Guides & summaries', body: 'Structured study guides and summaries you can print or download.' },
  { icon: Headphones, title: 'Podcasts', body: 'Turn any kit into a two-host audio episode for your commute.' },
  { icon: Gamepad2, title: 'Games', body: 'Definition Match, Stacker and Term Builder make drilling terms feel like play.' },
  { icon: MessageCircle, title: 'AI tutor', body: 'Ask questions about your own material and get explanations that stick.' },
  { icon: Upload, title: 'Any material', body: 'PDFs, slides, Word docs, photos of handwritten notes, lecture audio, video, YouTube links and web pages.' },
]

export default function Landing() {
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-surface-2">
            Log in
          </Link>
          <Link to="/login?mode=signup" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
            Sign up free
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-citrus-soft px-3 py-1 text-xs font-bold tracking-wide uppercase">
            <Sparkles className="size-3.5 text-citrus" /> Free &amp; open source
          </span>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
            Drop in your notes.
            <br />
            <span className="text-brand">Walk out ready.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            aehT turns your course material into a full study kit: adaptive quizzes, flashcards, practice tests, guides, podcasts and games. No paywall, no daily
            limits, and the code is open for anyone to read.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login?mode=signup" className="rounded-2xl bg-brand px-6 py-3.5 font-semibold text-brand-ink shadow-sm hover:brightness-110">
              Create your first kit
            </Link>
            <a
              href="https://github.com/anishlaha007/TheaClone"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-3.5 font-semibold hover:bg-surface-2"
            >
              <GitHubIcon className="size-5" /> View the code
            </a>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 rounded-3xl bg-ink p-8 text-bg md:grid-cols-3 md:p-10">
          {[
            ['1', 'Add material', 'Upload files, paste text, drop a YouTube link, or just type a topic.'],
            ['2', 'Get a kit', 'Gemini reads everything and builds concepts, cards and a question bank.'],
            ['3', 'Study smarter', 'Practice where you are weakest until every concept is mastered.'],
          ].map(([n, t, b]) => (
            <div key={n}>
              <div className="font-display text-4xl font-extrabold text-citrus">{n}</div>
              <h3 className="mt-2 font-display text-xl font-bold">{t}</h3>
              <p className="mt-1 text-sm opacity-75">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        aehT is an independent open-source project. It is not affiliated with, endorsed by, or connected to any commercial study app.
      </footer>
    </div>
  )
}
