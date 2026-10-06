import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Activity, Folder, Kit, Settings } from './types'
import { markLeaving, restBeacon, supabase } from './supabase'
import { dayKey } from './utils'

/**
 * App state, synced to Supabase. Every signed-in user has their own kits,
 * folders, settings and progress (enforced by row-level security). Writes
 * are applied to memory immediately and saved to the database shortly after.
 */

const THEME_KEY = 'aeht:theme'
const OWN_KEY = 'aeht:own-gemini-key'

export const DEFAULT_MODEL = 'gemini-flash-latest'
export const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-tts-preview'

const defaultSettings: Settings = {
  apiKey: '',
  model: DEFAULT_MODEL,
  ttsModel: DEFAULT_TTS_MODEL,
  language: 'auto',
  theme: 'system',
  questionsPerRound: 10,
  name: '',
}

export type User = { id: string; email: string; name: string; avatar?: string; provider?: string }

type State = {
  /** auth state is known */
  ready: boolean
  session: Session | null
  user: User | null
  /** the signed-in user's data has been loaded */
  loaded: boolean
  loadError?: string
  kits: Kit[]
  folders: Folder[]
  activity: Activity
  settings: Settings
  sync: { pending: number; error?: string }
}

function localSettings(): Settings {
  let theme = defaultSettings.theme
  let apiKey = ''
  try {
    theme = (localStorage.getItem(THEME_KEY) as Settings['theme']) || theme
    apiKey = localStorage.getItem(OWN_KEY) || ''
  } catch {
    /* storage unavailable */
  }
  return { ...defaultSettings, theme, apiKey }
}

const emptyActivity: Activity = { days: [], answered: 0, correct: 0 }

let state: State = {
  ready: false,
  session: null,
  user: null,
  loaded: false,
  kits: [],
  folders: [],
  activity: emptyActivity,
  settings: localSettings(),
  sync: { pending: 0 },
}

const listeners = new Set<() => void>()
function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

export function getState() {
  return state
}

// ---- auth ------------------------------------------------------------------

function toUser(session: Session | null): User | null {
  const u = session?.user
  if (!u) return null
  const meta = u.user_metadata || {}
  return {
    id: u.id,
    email: u.email || '',
    name: meta.full_name || meta.name || meta.user_name || (u.email || '').split('@')[0],
    avatar: meta.avatar_url || meta.picture,
    provider: u.app_metadata?.provider,
  }
}

let loadedFor: string | null = null

export async function initStore() {
  const { data } = await supabase.auth.getSession()
  handleSession(data.session)
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase recommends not awaiting other Supabase calls inside this callback.
    setTimeout(() => handleSession(session), 0)
  })
  // Save immediately when the tab is hidden or closed instead of waiting for the debounce.
  document.addEventListener('visibilitychange', () => {
    markLeaving(document.visibilityState === 'hidden')
    if (document.visibilityState === 'hidden') flushAll()
  })
  window.addEventListener('pagehide', () => {
    markLeaving(true)
    flushOnUnload()
  })
}

function handleSession(session: Session | null) {
  const user = toUser(session)
  setState({ ready: true, session, user })
  if (!user) {
    loadedFor = null
    setState({ loaded: false, kits: [], folders: [], activity: emptyActivity, settings: localSettings() })
    return
  }
  if (loadedFor !== user.id) {
    loadedFor = user.id
    loadUserData(user).catch((e) => {
      console.error(e)
      setState({ loaded: true, loadError: describeDbError(e) })
    })
  }
}

function describeDbError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e)
  if (/relation .* does not exist|Could not find the table|schema cache/i.test(msg))
    return 'The database tables are missing. Run supabase/migrations/0001_init.sql in your Supabase SQL editor.'
  return msg
}

async function loadUserData(user: User) {
  setState({ loaded: false, loadError: undefined })
  const [profileRes, foldersRes, kitsRes] = await Promise.all([
    supabase.from('profiles').select('display_name, settings, activity').eq('id', user.id).maybeSingle(),
    supabase.from('folders').select('id, name, created_at').order('created_at'),
    supabase.from('kits').select('id, folder_id, title, data, created_at, updated_at').order('updated_at', { ascending: false }),
  ])
  if (profileRes.error) throw profileRes.error
  if (foldersRes.error) throw foldersRes.error
  if (kitsRes.error) throw kitsRes.error

  let profile = profileRes.data
  if (!profile) {
    // The signup trigger normally creates this; make sure it exists anyway.
    const ins = await supabase.from('profiles').upsert({ id: user.id, display_name: user.name }).select('display_name, settings, activity').single()
    if (ins.error) throw ins.error
    profile = ins.data
  }
  const remote = (profile.settings || {}) as Partial<Settings>
  const settings: Settings = {
    ...defaultSettings,
    ...remote,
    name: remote.name || profile.display_name || user.name,
    apiKey: localSettings().apiKey,
    theme: remote.theme || localSettings().theme,
  }
  applyTheme(settings.theme)

  setState({
    loaded: true,
    settings,
    activity: { ...emptyActivity, ...(profile.activity as Activity) },
    folders: (foldersRes.data || []).map((f) => ({ id: f.id, name: f.name, createdAt: Date.parse(f.created_at) })),
    kits: (kitsRes.data || []).map(rowToKit),
  })
}

export async function signOut() {
  await flushAll()
  await supabase.auth.signOut()
}

// ---- row mapping -----------------------------------------------------------

type KitRow = { id: string; folder_id: string | null; title: string; data: Partial<Kit>; created_at: string; updated_at: string }

function rowToKit(r: KitRow): Kit {
  const d = r.data || {}
  return {
    description: '',
    emoji: '📘',
    color: '#0E7C66',
    language: 'auto',
    sources: [],
    concepts: [],
    cards: [],
    questions: [],
    mastery: {},
    chat: [],
    tests: [],
    createdAt: Date.parse(r.created_at),
    ...d,
    id: r.id,
    title: r.title || d.title || 'Untitled kit',
    folderId: r.folder_id || undefined,
    updatedAt: Date.parse(r.updated_at),
    sourceText: undefined,
  } as Kit
}

function kitData(kit: Kit): Partial<Kit> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sourceText, id, folderId, ...rest } = kit
  return rest
}

function kitRow(kit: Kit) {
  return {
    id: kit.id,
    user_id: state.user!.id,
    folder_id: kit.folderId ?? null,
    title: kit.title,
    data: kitData(kit),
    updated_at: new Date(kit.updatedAt).toISOString(),
  }
}

// ---- debounced saving -------------------------------------------------------

type Job = { t: number; run: () => Promise<void>; beacon?: () => void }
const timers = new Map<string, Job>()

/**
 * Debounces a save. `beacon` is a synchronous, unload-safe version of the
 * same write, used if the tab closes before the debounce fires.
 */
function schedule(key: string, run: () => Promise<void>, delay = 600, beacon?: () => void) {
  const prev = timers.get(key)
  if (prev) clearTimeout(prev.t)
  else setState({ sync: { ...state.sync, pending: state.sync.pending + 1 } })
  const t = window.setTimeout(() => execute(key), delay)
  timers.set(key, { t, run, beacon })
}

function flushOnUnload() {
  for (const [key, job] of [...timers]) {
    clearTimeout(job.t)
    if (job.beacon && state.session) {
      timers.delete(key)
      job.beacon()
    } else execute(key)
  }
}

async function execute(key: string) {
  const job = timers.get(key)
  if (!job) return
  timers.delete(key)
  try {
    await job.run()
    setState({ sync: { pending: Math.max(0, state.sync.pending - 1), error: undefined } })
  } catch (e) {
    console.error('Save failed', e)
    setState({ sync: { pending: Math.max(0, state.sync.pending - 1), error: describeDbError(e) } })
  }
}

export async function flushAll() {
  const keys = [...timers.keys()]
  for (const k of keys) clearTimeout(timers.get(k)!.t)
  await Promise.all(keys.map(execute))
}

async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p
  if (r.error) throw r.error
  return r
}

// ---- settings --------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch }
  setState({ settings })
  try {
    if (patch.theme) localStorage.setItem(THEME_KEY, patch.theme)
    if (patch.apiKey !== undefined) {
      if (patch.apiKey) localStorage.setItem(OWN_KEY, patch.apiKey)
      else localStorage.removeItem(OWN_KEY)
    }
  } catch {
    /* ignore */
  }
  if (patch.theme) applyTheme(patch.theme)
  if (!state.user) return
  // The personal API key never leaves this browser.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey, ...shared } = settings
  const uid = state.user.id
  const profilePatch = () => ({ settings: shared, display_name: shared.name || null, updated_at: new Date().toISOString() })
  schedule(
    'settings',
    async () => {
      await check(supabase.from('profiles').update(profilePatch()).eq('id', uid))
    },
    600,
    () => restBeacon('PATCH', `profiles?id=eq.${uid}`, profilePatch(), state.session!.access_token),
  )
}

export function applyTheme(theme = state.settings.theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

// ---- kits ------------------------------------------------------------------

export function getKit(id: string) {
  return state.kits.find((k) => k.id === id)
}

export function useKit(id: string | undefined) {
  return useStore((s) => s.kits.find((k) => k.id === id))
}

export async function addKit(kit: Kit) {
  setState({ kits: [kit, ...state.kits] })
  setState({ sync: { ...state.sync, pending: state.sync.pending + 1 } })
  try {
    await check(supabase.from('kits').insert({ ...kitRow(kit), source_text: kit.sourceText || '', created_at: new Date(kit.createdAt).toISOString() }))
    setState({ sync: { pending: Math.max(0, state.sync.pending - 1), error: undefined } })
  } catch (e) {
    setState({ sync: { pending: Math.max(0, state.sync.pending - 1), error: describeDbError(e) } })
    throw e
  }
}

export function updateKit(id: string, patch: Partial<Kit> | ((k: Kit) => Partial<Kit>)) {
  let updated: Kit | undefined
  const kits = state.kits.map((k) => {
    if (k.id !== id) return k
    const p = typeof patch === 'function' ? patch(k) : patch
    updated = { ...k, ...p, updatedAt: Date.now() }
    return updated
  })
  if (!updated) return
  setState({ kits })
  const touchesSource = typeof patch !== 'function' && 'sourceText' in patch
  const row = () => {
    const latest = getKit(id)
    if (!latest || !state.user) return null
    const r: Record<string, unknown> = kitRow(latest)
    if (touchesSource) r.source_text = latest.sourceText || ''
    return r
  }
  schedule(
    `kit:${id}`,
    async () => {
      const r = row()
      if (r) await check(supabase.from('kits').upsert(r))
    },
    600,
    () => {
      const r = row()
      if (r) restBeacon('POST', 'kits', r, state.session!.access_token, 'resolution=merge-duplicates,return=minimal')
    },
  )
}

/** Loads a kit's extracted source material (kept out of the list query to stay fast). */
export async function ensureSourceText(id: string): Promise<string> {
  const kit = getKit(id)
  if (kit?.sourceText !== undefined) return kit.sourceText
  const { data, error } = await supabase.from('kits').select('source_text').eq('id', id).single()
  if (error) throw error
  const text = data.source_text || ''
  setState({ kits: state.kits.map((k) => (k.id === id ? { ...k, sourceText: text } : k)) })
  return text
}

export async function deleteKit(id: string) {
  const t = timers.get(`kit:${id}`)
  if (t) {
    clearTimeout(t.t)
    timers.delete(`kit:${id}`)
    setState({ sync: { ...state.sync, pending: Math.max(0, state.sync.pending - 1) } })
  }
  setState({ kits: state.kits.filter((k) => k.id !== id) })
  await check(supabase.from('kits').delete().eq('id', id))
  if (state.user) await supabase.storage.from('podcasts').remove([podcastPath(id)])
}

// ---- folders ---------------------------------------------------------------

export async function addFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: crypto.randomUUID(), name, createdAt: Date.now() }
  setState({ folders: [...state.folders, folder] })
  await check(supabase.from('folders').insert({ id: folder.id, name, user_id: state.user!.id }))
  return folder
}

export async function renameFolder(id: string, name: string) {
  setState({ folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)) })
  await check(supabase.from('folders').update({ name }).eq('id', id))
}

export async function deleteFolder(id: string) {
  setState({ folders: state.folders.filter((f) => f.id !== id) })
  for (const k of state.kits.filter((k) => k.folderId === id)) updateKit(k.id, { folderId: undefined })
  await check(supabase.from('folders').delete().eq('id', id))
}

// ---- activity / streaks ----------------------------------------------------

export function recordStudy(kitId: string, answered = 0, correct = 0) {
  const today = dayKey()
  const days = state.activity.days.includes(today) ? state.activity.days : [...state.activity.days, today].slice(-400)
  const activity: Activity = { days, answered: state.activity.answered + answered, correct: state.activity.correct + correct }
  setState({ activity })
  updateKit(kitId, { lastStudiedAt: Date.now() })
  if (!state.user) return
  const uid = state.user.id
  schedule(
    'activity',
    async () => {
      await check(supabase.from('profiles').update({ activity: state.activity }).eq('id', uid))
    },
    1000,
    () => restBeacon('PATCH', `profiles?id=eq.${uid}`, { activity: state.activity }, state.session!.access_token),
  )
}

// ---- podcast audio (Supabase Storage) ---------------------------------------

function podcastPath(kitId: string) {
  return `${state.user!.id}/${kitId}.wav`
}
export async function savePodcastAudio(kitId: string, blob: Blob) {
  const { error } = await supabase.storage.from('podcasts').upload(podcastPath(kitId), blob, { upsert: true, contentType: 'audio/wav' })
  if (error) throw error
}
export async function loadPodcastAudio(kitId: string): Promise<Blob | undefined> {
  const { data, error } = await supabase.storage.from('podcasts').download(podcastPath(kitId))
  if (error) return undefined
  return data
}

// ---- source file uploads ----------------------------------------------------

/** Stores an original upload in the user's private bucket and returns its path. */
export async function uploadSourceFile(file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${state.user!.id}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('sources').upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error
  return path
}

// ---- backup ----------------------------------------------------------------

export async function exportAll() {
  await Promise.all(state.kits.map((k) => ensureSourceText(k.id).catch(() => '')))
  return JSON.stringify(
    { app: 'aeht', version: 1, exportedAt: new Date().toISOString(), kits: state.kits, folders: state.folders },
    null,
    2,
  )
}

export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json)
  const incoming: Kit[] = Array.isArray(data) ? data : data.kits ? data.kits : data.id ? [data] : []
  if (!incoming.length) throw new Error('No study kits found in that file.')
  if (Array.isArray(data.folders)) {
    const have = new Set(state.folders.map((f) => f.id))
    for (const f of data.folders as Folder[]) {
      if (!have.has(f.id)) {
        setState({ folders: [...state.folders, f] })
        await check(supabase.from('folders').upsert({ id: f.id, name: f.name, user_id: state.user!.id }))
      }
    }
  }
  const existing = new Set(state.kits.map((k) => k.id))
  for (const k of incoming) {
    if (!k || typeof k !== 'object' || !k.id || !Array.isArray(k.cards)) throw new Error('That file is not an aehT backup.')
    const defaults: Partial<Kit> = { chat: [], tests: [], mastery: {}, concepts: [], questions: [], sources: [], sourceText: '' }
    const kit = { ...defaults, ...(k as Partial<Kit>) } as Kit
    // Kit ids are global primary keys, so give imported copies of kits we don't own a fresh id.
    if (existing.has(kit.id)) updateKit(kit.id, { ...kit, sourceText: kit.sourceText })
    else await addKit({ ...kit, id: crypto.randomUUID() })
  }
  return incoming.length
}

export async function wipeAll() {
  const uid = state.user!.id
  await check(supabase.from('kits').delete().eq('user_id', uid))
  await check(supabase.from('folders').delete().eq('user_id', uid))
  await check(supabase.from('profiles').update({ activity: emptyActivity }).eq('id', uid))
  for (const bucket of ['podcasts', 'sources']) {
    const { data } = await supabase.storage.from(bucket).list(uid, { limit: 1000 })
    if (data?.length) await supabase.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`))
  }
  setState({ kits: [], folders: [], activity: emptyActivity })
}
