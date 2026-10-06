import { useRef, useState } from 'react'
import { AlignLeft } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { updateKit } from '../../lib/store'
import { streamSummary } from '../../lib/ai'
import { Button, EmptyState, Segmented } from '../../components/ui'
import { DocumentView } from './StudyGuide'
import { slugify } from '../../lib/utils'
import type { SummaryLength } from '../../lib/types'

const LENGTHS: { value: SummaryLength; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
]

export default function Summary() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [length, setLength] = useState<SummaryLength>(kit.summary?.length || 'standard')
  const [live, setLive] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)

  async function generate(len = length) {
    setError(null)
    setLive('')
    abort.current = new AbortController()
    try {
      const text = await streamSummary(kit, await getSource(), len, setLive, abort.current.signal)
      if (text) updateKit(kit.id, { summary: { length: len, text } })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e)
    } finally {
      setLive(null)
    }
  }

  const text = live ?? (kit.summary?.length === length ? kit.summary.text : kit.summary?.text) ?? ''
  const picker = (
    <Segmented
      value={length}
      onChange={(l) => {
        setLength(l)
        if (kit.summary && live === null) generate(l)
      }}
      options={LENGTHS}
    />
  )

  if (!text && live === null && !error) {
    return (
      <EmptyState
        icon={<AlignLeft className="size-7" />}
        title="Summary"
        body="The essentials of your material, condensed. Pick how much detail you want."
        action={
          <div className="flex flex-col items-center gap-4">
            {picker}
            <Button onClick={() => generate()}>Summarize</Button>
          </div>
        }
      />
    )
  }
  return (
    <DocumentView
      text={text}
      streaming={live !== null}
      filename={`${slugify(kit.title)}-summary`}
      error={error}
      onRetry={() => generate()}
      onStop={() => abort.current?.abort()}
      toolbar={picker}
    />
  )
}
