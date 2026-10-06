import { useState } from 'react'
import { Plus, Trash2, Star, Sparkles, Upload } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { updateKit } from '../../lib/store'
import { draftKit, generateQuestions } from '../../lib/ai'
import { parseCardList } from '../../lib/extract'
import { Button, ErrorBox, Modal, Panel } from '../../components/ui'
import { uid } from '../../lib/utils'
import type { Card } from '../../lib/types'

export default function CardsEditor() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [bulk, setBulk] = useState<string | null>(null)

  function patch(id: string, p: Partial<Card>) {
    updateKit(kit.id, (k) => ({ cards: k.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  }

  function add() {
    updateKit(kit.id, (k) => ({ cards: [...k.cards, { id: uid('f'), term: '', definition: '', conceptId: k.concepts[0]?.id }] }))
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)
  }

  async function moreCards() {
    setError(null)
    setBusy('cards')
    try {
      const draft = await draftKit(
        (await getSource()) + `\n\nExisting flashcards (do not repeat these):\n${kit.cards.map((c) => `- ${c.term}`).join('\n')}`,
        10,
        kit.language,
      )
      const existing = new Set(kit.cards.map((c) => c.term.toLowerCase()))
      const fresh = draft.cards.filter((c) => !existing.has(c.term.toLowerCase())).map((c) => ({ ...c, conceptId: kit.concepts.find((k) => k.name === draft.concepts.find((d) => d.id === c.conceptId)?.name)?.id ?? kit.concepts[0]?.id }))
      updateKit(kit.id, (k) => ({ cards: [...k.cards, ...fresh] }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function buildQuestions() {
    // For kits created from an imported list: derive concepts + questions from the cards.
    setError(null)
    setBusy('questions')
    try {
      const source = await getSource()
      let k = kit
      if (!k.concepts.length) {
        const draft = await draftKit(source, 'auto', kit.language)
        const byTerm = new Map(draft.cards.map((c) => [c.term.toLowerCase(), c.conceptId]))
        k = { ...k, concepts: draft.concepts, cards: k.cards.map((c) => ({ ...c, conceptId: byTerm.get(c.term.toLowerCase()) ?? draft.concepts[0]?.id })) }
        updateKit(kit.id, { concepts: k.concepts, cards: k.cards, mastery: Object.fromEntries(draft.concepts.map((c) => [c.id, 0])) })
      }
      const qs = await generateQuestions(k, source, { count: 20, avoid: kit.questions.map((q) => q.prompt) })
      updateKit(kit.id, (x) => ({ questions: [...x.questions, ...qs] }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const shown = kit.cards.filter((c) => !filter || `${c.term} ${c.definition}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-2xl font-bold">Flashcards ({kit.cards.length})</h2>
        <Button variant="secondary" size="sm" onClick={() => setBulk('')}>
          <Upload className="size-4" /> Bulk add
        </Button>
        <Button variant="secondary" size="sm" onClick={moreCards} loading={busy === 'cards'}>
          <Sparkles className="size-4" /> 10 more with AI
        </Button>
        <Button variant="secondary" size="sm" onClick={buildQuestions} loading={busy === 'questions'}>
          <Sparkles className="size-4" /> Write quiz questions
        </Button>
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> Add card
        </Button>
      </div>
      {error ? <ErrorBox error={error} /> : null}
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter cards" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand" />
      <div className="space-y-3">
        {shown.map((c, i) => (
          <Panel key={c.id} className="grid gap-3 p-4 md:grid-cols-[2rem_1fr_2fr_auto] md:items-start">
            <span className="pt-2.5 text-xs font-bold text-muted">{i + 1}</span>
            <textarea
              value={c.term}
              onChange={(e) => patch(c.id, { term: e.target.value })}
              placeholder="Term"
              rows={2}
              className="resize-y rounded-xl border border-line bg-bg px-3 py-2 text-sm font-semibold outline-none focus:border-brand"
            />
            <textarea
              value={c.definition}
              onChange={(e) => patch(c.id, { definition: e.target.value })}
              placeholder="Definition"
              rows={2}
              className="resize-y rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="flex gap-1 md:flex-col">
              <button onClick={() => patch(c.id, { starred: !c.starred })} className={`rounded-lg p-2 hover:bg-surface-2 ${c.starred ? 'text-citrus' : 'text-muted'}`} aria-label="Star">
                <Star className={`size-4 ${c.starred ? 'fill-current' : ''}`} />
              </button>
              <button onClick={() => updateKit(kit.id, (k) => ({ cards: k.cards.filter((x) => x.id !== c.id) }))} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-bad" aria-label="Delete card">
                <Trash2 className="size-4" />
              </button>
            </div>
          </Panel>
        ))}
      </div>

      <Modal open={bulk !== null} onClose={() => setBulk(null)} title="Bulk add cards" wide>
        <p className="mb-3 text-sm text-muted">One card per line. Separate term and definition with a tab, " - ", ";" or ",".</p>
        <textarea value={bulk || ''} onChange={(e) => setBulk(e.target.value)} rows={10} className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-sm" />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted">{parseCardList(bulk || '').length} cards</span>
          <Button
            onClick={() => {
              const cards = parseCardList(bulk || '').map((c) => ({ id: uid('f'), ...c, conceptId: kit.concepts[0]?.id }))
              updateKit(kit.id, (k) => ({ cards: [...k.cards, ...cards] }))
              setBulk(null)
            }}
          >
            Add cards
          </Button>
        </div>
      </Modal>
    </div>
  )
}
