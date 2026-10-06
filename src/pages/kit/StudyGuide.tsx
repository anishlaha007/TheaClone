import { useRef, useState } from 'react'
import { BookOpen, Download, Printer, RefreshCw, Square } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { updateKit } from '../../lib/store'
import { streamGuide } from '../../lib/ai'
import { Button, EmptyState, ErrorBox, Panel, Spinner } from '../../components/ui'
import { Markdown } from '../../components/Markdown'
import { downloadFile, slugify } from '../../lib/utils'

/** Shared UI for streamed Markdown documents (guide + summary). */
export function DocumentView({
  text,
  streaming,
  filename,
  error,
  onRetry,
  onStop,
  toolbar,
}: {
  text: string
  streaming: boolean
  filename: string
  error: unknown
  onRetry: () => void
  onStop: () => void
  toolbar?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="ml-auto flex gap-2">
          {streaming ? (
            <Button variant="secondary" size="sm" onClick={onStop}>
              <Square className="size-4" /> Stop
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw className="size-4" /> Regenerate
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={!text || streaming} onClick={() => downloadFile(`${filename}.md`, text, 'text/markdown')}>
            <Download className="size-4" /> .md
          </Button>
          <Button variant="secondary" size="sm" disabled={!text || streaming} onClick={() => window.print()}>
            <Printer className="size-4" /> Print / PDF
          </Button>
        </div>
      </div>
      {error ? <ErrorBox error={error} onRetry={onRetry} /> : null}
      <Panel className="print-area p-6 md:p-10">
        {text ? <Markdown>{text}</Markdown> : <Spinner label="Writing…" />}
        {streaming && text && <span className="inline-block h-4 w-2 animate-pulse bg-brand align-middle" />}
      </Panel>
    </div>
  )
}

export default function StudyGuide() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [live, setLive] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)

  async function generate() {
    setError(null)
    setLive('')
    abort.current = new AbortController()
    try {
      const text = await streamGuide(kit, await getSource(), setLive, abort.current.signal)
      if (text) updateKit(kit.id, { guide: text })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e)
    } finally {
      setLive(null)
    }
  }

  const text = live ?? kit.guide ?? ''
  if (!text && live === null && !error) {
    return (
      <EmptyState
        icon={<BookOpen className="size-7" />}
        title="Study guide"
        body="A structured, exam-ready guide: objectives, every concept explained with examples, common mistakes, a checklist and practice questions."
        action={<Button onClick={generate}>Generate study guide</Button>}
      />
    )
  }
  return (
    <DocumentView
      text={text}
      streaming={live !== null}
      filename={`${slugify(kit.title)}-study-guide`}
      error={error}
      onRetry={generate}
      onStop={() => abort.current?.abort()}
    />
  )
}
