import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Send, Trash2, MessageCircle, Square } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { recordStudy, updateKit } from '../../lib/store'
import { streamChat } from '../../lib/ai'
import { Button, ErrorBox } from '../../components/ui'
import { Markdown } from '../../components/Markdown'
import type { ChatMessage } from '../../lib/types'

const STARTERS = ['Explain the hardest idea here like I’m 12', 'Quiz me one question at a time', 'What will most likely be on the exam?', 'Give me a mnemonic for the key terms']

export default function Chat() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [input, setInput] = useState('')
  const [live, setLive] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [kit.chat.length, live])

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || live !== null) return
    setInput('')
    setError(null)
    const history: ChatMessage[] = [...kit.chat, { role: 'user', text: msg, at: Date.now() }]
    updateKit(kit.id, { chat: history })
    setLive('')
    abort.current = new AbortController()
    try {
      const reply = await streamChat(
        kit,
        await getSource(),
        history.slice(-30).map((m) => ({ role: m.role, text: m.text })),
        setLive,
        abort.current.signal,
      )
      updateKit(kit.id, (k) => ({ chat: [...k.chat, { role: 'model', text: reply || '…', at: Date.now() }] }))
      recordStudy(kit.id)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setLive((partial) => {
          if (partial) updateKit(kit.id, (k) => ({ chat: [...k.chat, { role: 'model', text: partial, at: Date.now() }] }))
          return null
        })
      } else setError(e)
    } finally {
      setLive(null)
    }
  }

  const messages = kit.chat

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: 'calc(100vh - 260px)' }}>
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && live === null && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
              <MessageCircle className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-bold">Ask your tutor</h2>
            <p className="mt-1 text-sm text-muted">Answers are grounded in this kit’s material.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm hover:border-brand">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {live !== null && <Bubble role="model" text={live || '…'} streaming />}
        {error ? <ErrorBox error={error} /> : null}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-20 rounded-2xl border border-line bg-surface p-2 shadow-lg md:bottom-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-end gap-2"
        >
          {messages.length > 0 && (
            <button type="button" onClick={() => confirm('Clear this conversation?') && updateKit(kit.id, { chat: [] })} className="rounded-xl p-2.5 text-muted hover:bg-surface-2" aria-label="Clear chat">
              <Trash2 className="size-5" />
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={1}
            placeholder="Ask anything about this kit…"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none"
          />
          {live !== null ? (
            <Button type="button" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}

function Bubble({ role, text, streaming }: { role: 'user' | 'model'; text: string; streaming?: boolean }) {
  return (
    <div className={clsx('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-sm', role === 'user' ? 'rounded-br-sm bg-brand text-brand-ink' : 'rounded-bl-sm border border-line bg-surface')}>
        {role === 'user' ? <p className="whitespace-pre-wrap">{text}</p> : <Markdown>{text}</Markdown>}
        {streaming && <span className="inline-block h-3 w-1.5 animate-pulse bg-brand align-middle" />}
      </div>
    </div>
  )
}
