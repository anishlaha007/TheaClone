import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, Search, FolderPlus, Folder as FolderIcon, Flame, Target, Layers, Brain, MoreHorizontal, Trash2, Pencil, Sparkles } from 'lucide-react'
import { useStore, addFolder, deleteFolder, renameFolder, updateKit } from '../lib/store'
import { computeStreak, timeAgo } from '../lib/utils'
import { dueCards, kitMastery, masteryLevel } from '../lib/learning'
import { Button, EmptyState, LinkButton, Modal, Panel, ProgressRing } from '../components/ui'
import type { Kit } from '../lib/types'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function KitCard({ kit, folders }: { kit: Kit; folders: { id: string; name: string }[] }) {
  const mastery = kitMastery(kit)
  const due = dueCards(kit.cards).length
  const [menu, setMenu] = useState(false)
  return (
    <div className="group relative">
      <Link to={`/kit/${kit.id}`} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-12 place-items-center rounded-xl text-2xl" style={{ background: `${kit.color}22` }}>
            {kit.emoji}
          </div>
          <ProgressRing value={mastery} color={masteryLevel(mastery).color} />
        </div>
        <h3 className="mt-4 line-clamp-2 font-display text-lg leading-snug font-bold">{kit.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{kit.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
          <span>{kit.cards.length} cards</span>
          <span>{kit.questions.length} questions</span>
          {due > 0 && <span className="font-semibold text-brand">{due} due</span>}
          <span className="ml-auto">{timeAgo(kit.lastStudiedAt || kit.updatedAt)}</span>
        </div>
      </Link>
      <button
        onClick={() => setMenu((m) => !m)}
        className="absolute top-3 right-16 rounded-lg p-1.5 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 focus:opacity-100"
        aria-label="Kit options"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <div className="anim-pop absolute top-11 right-4 z-20 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl" onMouseLeave={() => setMenu(false)}>
          <div className="px-2 py-1 text-xs font-semibold text-muted">Move to folder</div>
          <button className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => (updateKit(kit.id, { folderId: undefined }), setMenu(false))}>
            No folder
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={clsx('w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2', kit.folderId === f.id && 'font-semibold text-brand')}
              onClick={() => (updateKit(kit.id, { folderId: f.id }), setMenu(false))}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const kits = useStore((s) => s.kits)
  const folders = useStore((s) => s.folders)
  const activity = useStore((s) => s.activity)
  const name = useStore((s) => s.settings.name)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState<string>('all')
  const [folderModal, setFolderModal] = useState<{ id?: string; name: string } | null>(null)

  const streak = computeStreak(activity.days)
  const totalDue = kits.reduce((n, k) => n + dueCards(k.cards).length, 0)
  const accuracy = activity.answered ? Math.round((activity.correct / activity.answered) * 100) : 0
  const recent = useMemo(() => [...kits].filter((k) => k.lastStudiedAt).sort((a, b) => (b.lastStudiedAt || 0) - (a.lastStudiedAt || 0))[0], [kits])

  const visible = kits.filter((k) => {
    if (folder !== 'all' && (folder === 'none' ? k.folderId : k.folderId !== folder)) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return k.title.toLowerCase().includes(q) || k.description.toLowerCase().includes(q)
  })

  // Last 7 days of activity for the mini calendar
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), active: activity.days.includes(key) }
  })

  async function saveFolder() {
    if (!folderModal?.name.trim()) return
    if (folderModal.id) await renameFolder(folderModal.id, folderModal.name.trim())
    else await addFolder(folderModal.name.trim())
    setFolderModal(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">{greeting()}{name ? `, ${name.split(' ')[0]}` : ''}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">What are we studying today?</h1>
        </div>
        <LinkButton to="/new" className="!px-5 !py-3">
          <Plus className="size-5" /> New study kit
        </LinkButton>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Panel className="p-5 md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 font-display text-3xl font-extrabold">
                <Flame className="size-7 text-citrus" /> {streak}
              </div>
              <p className="text-sm text-muted">day streak</p>
            </div>
            <div className="flex gap-1.5">
              {week.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={clsx('size-7 rounded-lg', d.active ? 'bg-citrus' : 'bg-surface-2')} />
                  <span className="text-[10px] text-muted">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2 font-display text-3xl font-extrabold">
            <Layers className="size-6 text-brand" /> {totalDue}
          </div>
          <p className="text-sm text-muted">cards due for review</p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2 font-display text-3xl font-extrabold">
            <Target className="size-6 text-brand" /> {accuracy}%
          </div>
          <p className="text-sm text-muted">accuracy · {activity.answered} answered</p>
        </Panel>
      </div>

      {recent && (
        <button
          onClick={() => navigate(`/kit/${recent.id}/smart`)}
          className="flex w-full items-center gap-4 rounded-2xl bg-brand p-5 text-left text-brand-ink shadow-sm transition hover:brightness-110"
        >
          <div className="grid size-12 place-items-center rounded-xl bg-white/15 text-2xl">{recent.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold tracking-wide uppercase opacity-80">Pick up where you left off</div>
            <div className="truncate font-display text-xl font-bold">{recent.title}</div>
          </div>
          <span className="hidden items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold sm:flex">
            <Brain className="size-4" /> Smart Study
          </span>
        </button>
      )}

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative mr-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your kits"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-sm outline-none focus:border-brand"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'all', name: 'All' }, ...folders, ...(folders.length ? [{ id: 'none', name: 'Unfiled' }] : [])].map((f) => (
              <span key={f.id} className="group relative">
                <button
                  onClick={() => setFolder(f.id)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                    folder === f.id ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-ink',
                  )}
                >
                  {f.id !== 'all' && f.id !== 'none' && <FolderIcon className="size-3.5" />}
                  {f.name}
                </button>
                {f.id !== 'all' && f.id !== 'none' && folder === f.id && (
                  <span className="ml-1 inline-flex gap-0.5 align-middle">
                    <button className="rounded p-1 text-muted hover:text-ink" aria-label="Rename folder" onClick={() => setFolderModal({ id: f.id, name: f.name })}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="rounded p-1 text-muted hover:text-bad"
                      aria-label="Delete folder"
                      onClick={() => {
                        if (confirm(`Delete folder "${f.name}"? Kits inside it are kept.`)) {
                          deleteFolder(f.id)
                          setFolder('all')
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </span>
            ))}
            <button onClick={() => setFolderModal({ name: '' })} className="flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-muted hover:text-ink">
              <FolderPlus className="size-3.5" /> Folder
            </button>
          </div>
        </div>

        {kits.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-7" />}
            title="Make your first study kit"
            body="Upload lecture slides, a PDF, photos of your notes, a recording or a YouTube link, and aehT will build everything you need to study it."
            action={<LinkButton to="/new">Create a kit</LinkButton>}
          />
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No kits match.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((k) => (
              <KitCard key={k.id} kit={k} folders={folders} />
            ))}
          </div>
        )}
      </div>

      <Modal open={!!folderModal} onClose={() => setFolderModal(null)} title={folderModal?.id ? 'Rename folder' : 'New folder'}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveFolder()
          }}
          className="space-y-4"
        >
          <input
            autoFocus
            value={folderModal?.name || ''}
            onChange={(e) => setFolderModal((m) => (m ? { ...m, name: e.target.value } : m))}
            placeholder="e.g. Biology 101"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFolderModal(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
