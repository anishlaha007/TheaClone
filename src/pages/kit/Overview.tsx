import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Layers, ClipboardCheck, BookOpen, AlignLeft, Headphones, Gamepad2, MessageCircle, Pencil, Trash2, Download, FileText, CirclePlay, Globe, Lightbulb, Copy } from 'lucide-react'
import { useKitContext } from './KitLayout'
import { deleteKit, ensureSourceText, updateKit, useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { dueCards, kitMastery, masteryLevel } from '../../lib/learning'
import { Bar, Button, Modal, Panel, ProgressRing } from '../../components/ui'
import { downloadFile, slugify, timeAgo } from '../../lib/utils'
import { LANGUAGES } from '../../lib/languages'

const tiles = [
  { to: 'smart', icon: Brain, title: 'Smart Study', body: 'Adaptive questions on your weak spots' },
  { to: 'flashcards', icon: Layers, title: 'Flashcards', body: 'Flip, sort and spaced review' },
  { to: 'test', icon: ClipboardCheck, title: 'Practice test', body: 'Timed, exam-style, AI graded' },
  { to: 'guide', icon: BookOpen, title: 'Study guide', body: 'Structured, printable guide' },
  { to: 'summary', icon: AlignLeft, title: 'Summary', body: 'The essentials, fast' },
  { to: 'podcast', icon: Headphones, title: 'Podcast', body: 'Listen and learn' },
  { to: 'games', icon: Gamepad2, title: 'Games', body: 'Match, Stacker, Term Builder' },
  { to: 'chat', icon: MessageCircle, title: 'Tutor', body: 'Ask anything about it' },
]

export default function Overview() {
  const { kit } = useKitContext()
  const navigate = useNavigate()
  const folders = useStore((s) => s.folders)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: kit.title, description: kit.description, emoji: kit.emoji, folderId: kit.folderId || '', language: kit.language })
  const mastery = kitMastery(kit)
  const due = dueCards(kit.cards).length

  async function exportKit() {
    const sourceText = await ensureSourceText(kit.id).catch(() => '')
    downloadFile(`${slugify(kit.title)}.aeht.json`, JSON.stringify({ app: 'aeht', version: 1, kits: [{ ...kit, sourceText }] }, null, 2), 'application/json')
  }

  async function openSource(path: string) {
    const { data, error } = await supabase.storage.from('sources').createSignedUrl(path, 60)
    if (error) return alert(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="flex items-center gap-5 p-5 md:col-span-2">
          <ProgressRing value={mastery} size={84} stroke={8} color={masteryLevel(mastery).color}>
            <span className="text-base">{mastery}%</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold tracking-wide text-muted uppercase">{masteryLevel(mastery).label}</div>
            <p className="mt-1 text-sm">{kit.description}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{kit.cards.length} flashcards</span>
              <span>{kit.questions.length} questions</span>
              <span>{kit.concepts.length} concepts</span>
              <span>Studied {timeAgo(kit.lastStudiedAt)}</span>
            </div>
          </div>
        </Panel>
        <Panel className="flex flex-col justify-between gap-3 p-5">
          <div>
            <div className="font-display text-3xl font-extrabold">{due}</div>
            <p className="text-sm text-muted">cards due for spaced review</p>
          </div>
          <Button onClick={() => navigate(`/kit/${kit.id}/flashcards?mode=review`)} variant="secondary" disabled={!due}>
            Review now
          </Button>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.to} to={`/kit/${kit.id}/${t.to}`} className="rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md">
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <t.icon className="size-5" />
            </div>
            <div className="font-display font-bold">{t.title}</div>
            <div className="text-xs text-muted">{t.body}</div>
          </Link>
        ))}
      </div>

      {kit.concepts.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-4 font-display text-lg font-bold">Concept mastery</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {kit.concepts.map((c) => {
              const m = kit.mastery[c.id] ?? 0
              const lvl = masteryLevel(m)
              return (
                <div key={c.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold" title={c.summary}>
                      {c.name}
                    </span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: lvl.color }}>
                      {lvl.label} · {m}%
                    </span>
                  </div>
                  <Bar value={m} color={lvl.color} />
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Sources</h2>
        <ul className="space-y-2 text-sm">
          {kit.sources.map((s, i) => {
            const Icon = s.kind === 'youtube' ? CirclePlay : s.kind === 'url' ? Globe : s.kind === 'topic' ? Lightbulb : FileText
            return (
              <li key={i} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted" />
                {s.kind === 'url' || s.kind === 'youtube' ? (
                  <a href={s.name} target="_blank" rel="noreferrer" className="truncate text-brand underline">
                    {s.name}
                  </a>
                ) : s.storagePath ? (
                  <button onClick={() => openSource(s.storagePath!)} className="truncate text-left text-brand underline">
                    {s.name}
                  </button>
                ) : (
                  <span className="truncate">{s.name}</span>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="size-4" /> Edit details
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/kit/${kit.id}/cards`)}>
          <Copy className="size-4" /> Edit flashcards
        </Button>
        <Button variant="secondary" onClick={exportKit}>
          <Download className="size-4" /> Export
        </Button>
        <Button
          variant="ghost"
          className="text-bad"
          onClick={async () => {
            if (confirm(`Delete "${kit.title}"? This can't be undone.`)) {
              await deleteKit(kit.id)
              navigate('/')
            }
          }}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit kit">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            updateKit(kit.id, { title: draft.title.trim() || kit.title, description: draft.description, emoji: draft.emoji || kit.emoji, folderId: draft.folderId || undefined, language: draft.language })
            setEditing(false)
          }}
        >
          <div className="flex gap-2">
            <input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} className="w-16 rounded-xl border border-line bg-bg px-3 py-2.5 text-center text-xl" aria-label="Emoji" />
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm" aria-label="Title" />
          </div>
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm" aria-label="Description" />
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Folder</span>
            <select value={draft.folderId} onChange={(e) => setDraft({ ...draft, folderId: e.target.value })} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5">
              <option value="">None</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">AI output language</span>
            <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5">
              <option value="auto">Same as material</option>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
