import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Upload, FileText, Link2, Lightbulb, ListChecks, X, Check, Loader2, CirclePlay, Globe, File as FileIcon, Image, Music, Video } from 'lucide-react'
import { Button, ErrorBox, Panel, Segmented } from '../components/ui'
import { addKit, useStore, uploadSourceFile } from '../lib/store'
import { ACCEPT, extractFile, isUrl, parseCardList, parseYouTube, type Extracted } from '../lib/extract'
import { draftKit, generateQuestions, ingestMedia, ingestUrl, ingestYouTube, writePrimer } from '../lib/ai'
import { LANGUAGES } from '../lib/languages'
import type { Card, Kit, SourceMeta } from '../lib/types'
import { KIT_COLORS, pick, uid } from '../lib/utils'

type Mode = 'material' | 'topic' | 'import'
type Step = { label: string; state: 'todo' | 'doing' | 'done' }

function fileIcon(f: File) {
  if (f.type.startsWith('image/')) return Image
  if (f.type.startsWith('audio/')) return Music
  if (f.type.startsWith('video/')) return Video
  return FileIcon
}

export default function CreateKit() {
  const navigate = useNavigate()
  const settings = useStore((s) => s.settings)
  const folders = useStore((s) => s.folders)
  const [mode, setMode] = useState<Mode>('material')
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState('')
  const [links, setLinks] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('high school')
  const [importText, setImportText] = useState('')
  const [importTitle, setImportTitle] = useState('')
  const [cardCount, setCardCount] = useState<'auto' | number>('auto')
  const [language, setLanguage] = useState(settings.language)
  const [folderId, setFolderId] = useState('')
  const [dragging, setDragging] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<unknown>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = steps !== null && !error
  const parsedImport = parseCardList(importText)
  const canCreate =
    mode === 'material' ? files.length > 0 || text.trim().length > 20 || links.length > 0 : mode === 'topic' ? topic.trim().length > 2 : parsedImport.length >= 2

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 20))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function addLink() {
    const v = linkInput.trim()
    if (!isUrl(v)) return setError(new Error('That doesn’t look like a link. Paste a full URL starting with https://'))
    setError(null)
    setLinks((l) => [...new Set([...l, v])])
    setLinkInput('')
  }

  function step(i: number, state: Step['state']) {
    setSteps((s) => s && s.map((x, j) => (j === i ? { ...x, state } : x)))
  }

  async function create() {
    setError(null)
    const lang = language
    const kitId = uid('k')
    const base = {
      id: kitId,
      language: lang,
      folderId: folderId || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mastery: {},
      chat: [],
      tests: [],
    }

    try {
      if (mode === 'import') {
        const cards: Card[] = parsedImport.map((c) => ({ id: uid('f'), term: c.term, definition: c.definition }))
        const kit: Kit = {
          ...base,
          title: importTitle.trim() || 'Imported flashcards',
          description: `${cards.length} imported flashcards`,
          emoji: '🗂️',
          color: pick(KIT_COLORS),
          sources: [{ kind: 'text', name: 'Imported list', chars: importText.length }],
          sourceText: cards.map((c) => `${c.term}: ${c.definition}`).join('\n'),
          concepts: [],
          cards,
          questions: [],
        }
        setSteps([{ label: 'Saving your cards', state: 'doing' }])
        await addKit(kit)
        navigate(`/kit/${kit.id}`)
        return
      }

      const plan: Step[] =
        mode === 'topic'
          ? [
              { label: 'Researching the topic', state: 'todo' },
              { label: 'Mapping concepts & writing flashcards', state: 'todo' },
              { label: 'Writing Smart Study questions', state: 'todo' },
              { label: 'Saving to your account', state: 'todo' },
            ]
          : [
              { label: 'Reading your material', state: 'todo' },
              { label: 'Mapping concepts & writing flashcards', state: 'todo' },
              { label: 'Writing Smart Study questions', state: 'todo' },
              { label: 'Saving to your account', state: 'todo' },
            ]
      setSteps(plan)

      // 1. Material → text
      step(0, 'doing')
      const sources: SourceMeta[] = []
      const texts: string[] = []
      if (mode === 'topic') {
        texts.push(await writePrimer(topic.trim(), level))
        sources.push({ kind: 'topic', name: topic.trim() })
      } else {
        const extracted: Extracted[] = []
        const storedPaths: Record<string, string> = {}
        for (const f of files) {
          setStatus(`Opening ${f.name}…`)
          const ex = await extractFile(f)
          extracted.push(ex)
          // Keep the original file in the user's private storage.
          try {
            setStatus(`Saving ${f.name}…`)
            storedPaths[ex.name] = await uploadSourceFile(ex.file)
          } catch (e) {
            console.warn('Could not store original file', e)
          }
          sources.push({ kind: 'file', name: f.name, mime: ex.mime, chars: ex.text?.length, storagePath: storedPaths[ex.name] })
          if (ex.text) texts.push(`# Source: ${ex.name}\n\n${ex.text}`)
        }
        const media = extracted.filter((e) => e.needsAI)
        if (media.length) texts.push(await ingestMedia(media, setStatus, storedPaths))
        for (const link of links) {
          const yt = parseYouTube(link)
          setStatus(yt ? 'Watching the video…' : `Reading ${new URL(link).hostname}…`)
          texts.push(yt ? await ingestYouTube(yt) : await ingestUrl(link))
          sources.push({ kind: yt ? 'youtube' : 'url', name: link })
        }
        if (text.trim()) {
          texts.push(`# Source: pasted notes\n\n${text.trim()}`)
          sources.push({ kind: 'text', name: 'Pasted notes', chars: text.length })
        }
      }
      const sourceText = texts.join('\n\n').trim()
      if (sourceText.length < 40) throw new Error('There wasn’t enough readable content in that material. Try adding more.')
      step(0, 'done')

      // 2. Concepts + cards
      step(1, 'doing')
      setStatus('')
      const draft = await draftKit(sourceText, cardCount, lang)
      step(1, 'done')

      // 3. Question bank
      step(2, 'doing')
      const partial: Kit = { ...base, ...draft, sources, sourceText, questions: [] }
      const questions = await generateQuestions(partial, sourceText, { count: Math.min(30, Math.max(16, draft.concepts.length * 4)) })
      step(2, 'done')

      // 4. Save
      step(3, 'doing')
      const kit: Kit = { ...partial, questions, mastery: Object.fromEntries(draft.concepts.map((c) => [c.id, 0])) }
      await addKit(kit)
      step(3, 'done')
      navigate(`/kit/${kit.id}`)
    } catch (e) {
      setError(e)
    }
  }

  if (steps) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <h1 className="font-display text-3xl font-extrabold">{error ? 'Something went wrong' : 'Building your study kit'}</h1>
        <p className="mt-2 text-sm text-muted">{error ? 'Nothing was lost. You can go back and try again.' : 'Bigger files and videos take a little longer. Keep this tab open.'}</p>
        <Panel className="mt-6 space-y-4 p-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className={clsx(
                  'grid size-7 place-items-center rounded-full text-xs font-bold',
                  s.state === 'done' ? 'bg-good text-white' : s.state === 'doing' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted',
                )}
              >
                {s.state === 'done' ? <Check className="size-4" /> : s.state === 'doing' && !error ? <Loader2 className="size-4 animate-spin" /> : i + 1}
              </span>
              <span className={clsx('text-sm font-medium', s.state === 'todo' && 'text-muted')}>{s.label}</span>
            </div>
          ))}
          {status && !error && <p className="pl-10 text-xs text-muted">{status}</p>}
        </Panel>
        {error ? (
          <div className="mt-4 space-y-3">
            <ErrorBox error={error} />
            <Button variant="secondary" onClick={() => (setSteps(null), setError(null))}>
              Back
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">New study kit</h1>
        <p className="mt-1 text-muted">Add anything you need to learn. aehT builds the flashcards, questions and everything else from it.</p>
      </div>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'material', label: 'From my material' },
          { value: 'topic', label: 'From a topic' },
          { value: 'import', label: 'Import flashcards' },
        ]}
      />

      {mode === 'material' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => (e.preventDefault(), setDragging(true))}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={clsx(
              'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition',
              dragging ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/60',
            )}
          >
            <Upload className="mx-auto size-8 text-brand" />
            <p className="mt-3 font-semibold">Drop files here or click to upload</p>
            <p className="mt-1 text-xs text-muted">PDF · slides (.pptx) · Word (.docx) · photos of notes · audio · video · text, Markdown, CSV, code and more</p>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => {
                const Icon = fileIcon(f)
                return (
                  <span key={i} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                    <Icon className="size-4 text-brand" />
                    <span className="max-w-48 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-muted hover:text-bad">
                      <X className="size-4" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          <Panel className="p-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Link2 className="size-4 text-brand" /> YouTube video or web page
            </label>
            <div className="flex gap-2">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
                placeholder="https://www.youtube.com/watch?v=…"
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <Button variant="secondary" onClick={addLink} disabled={!linkInput.trim()}>
                Add
              </Button>
            </div>
            {links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((l) => (
                  <span key={l} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                    {parseYouTube(l) ? <CirclePlay className="size-4 text-bad" /> : <Globe className="size-4 text-brand" />}
                    <span className="max-w-64 truncate">{l}</span>
                    <button onClick={() => setLinks((x) => x.filter((y) => y !== l))} aria-label="Remove link" className="text-muted hover:text-bad">
                      <X className="size-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-brand" /> Paste notes or text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste lecture notes, a textbook section, an article…"
              className="w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </Panel>
        </div>
      )}

      {mode === 'topic' && (
        <Panel className="space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-citrus" /> What do you want to learn?
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The causes of World War I, Photosynthesis, Big-O notation"
            className="w-full rounded-xl border border-line bg-bg px-3 py-3 outline-none focus:border-brand"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Level</span>
            <Segmented
              value={level}
              onChange={setLevel}
              options={['middle school', 'high school', 'university', 'expert'].map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))}
            />
          </div>
        </Panel>
      )}

      {mode === 'import' && (
        <Panel className="space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-brand" /> One card per line: term, then a tab, " - ", ";" or "," then the definition
          </label>
          <input
            value={importTitle}
            onChange={(e) => setImportTitle(e.target.value)}
            placeholder="Kit title"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            placeholder={'Mitochondria\tPowerhouse of the cell; makes ATP\nRibosome\tBuilds proteins from mRNA'}
            className="w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-brand"
          />
          <p className="text-xs text-muted">{parsedImport.length} cards detected. You can generate Smart Study questions from them afterwards.</p>
        </Panel>
      )}

      {mode !== 'import' && (
        <Panel className="grid gap-4 p-5 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold">Flashcards</span>
            <select
              value={String(cardCount)}
              onChange={(e) => setCardCount(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand"
            >
              <option value="auto">Automatic</option>
              {[10, 15, 20, 30, 40, 50].map((n) => (
                <option key={n} value={n}>
                  {n} cards
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold">Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand">
              <option value="auto">Same as material</option>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold">Folder</span>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand">
              <option value="">None</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </Panel>
      )}

      {error ? <ErrorBox error={error} /> : null}

      <div className="flex justify-end">
        <Button size="lg" onClick={create} disabled={!canCreate} loading={busy}>
          Create study kit
        </Button>
      </div>
    </div>
  )
}
