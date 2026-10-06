import { useRef, useState } from 'react'
import { Download, Upload, Trash2, KeyRound, Sun, LogOut, Cpu, ShieldCheck, Eye, EyeOff, Check } from 'lucide-react'
import { DEFAULT_MODEL, DEFAULT_TTS_MODEL, exportAll, importAll, signOut, updateSettings, useStore, wipeAll } from '../lib/store'
import { listModels, testKey, type ModelInfo } from '../lib/gemini'
import { supabase } from '../lib/supabase'
import { Button, ErrorBox, Panel, Segmented } from '../components/ui'
import { LANGUAGES } from '../lib/languages'
import { downloadFile } from '../lib/utils'
import type { Theme } from '../lib/types'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel className="p-5 md:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
        {icon} {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </Panel>
  )
}

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const user = useStore((s) => s.user)
  const kitCount = useStore((s) => s.kits.length)
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [aiStatus, setAiStatus] = useState<{ busy?: string; ok?: string; error?: unknown }>({})
  const [ownKey, setOwnKey] = useState(settings.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [password, setPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<{ busy?: boolean; ok?: boolean; error?: unknown }>({})
  const [dataMsg, setDataMsg] = useState<{ ok?: string; error?: unknown }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadModels() {
    setAiStatus({ busy: 'models' })
    try {
      const all = await listModels()
      setModels(all)
      setAiStatus({ ok: `${all.length} models available.` })
    } catch (error) {
      setAiStatus({ error })
    }
  }

  async function runTest() {
    setAiStatus({ busy: 'test' })
    try {
      const reply = await testKey()
      setAiStatus({ ok: `Gemini is working (${settings.model} replied “${reply.slice(0, 30)}”).` })
    } catch (error) {
      setAiStatus({ error })
    }
  }

  const textModels = models?.filter((m) => m.methods.includes('generateContent') && !/tts|embedding|image|veo|imagen|aqa|live/i.test(m.name))
  const ttsModels = models?.filter((m) => /tts/i.test(m.name))
  const isEmailUser = user?.provider === 'email'

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>

      <Section title="Account" icon={<ShieldCheck className="size-5 text-brand" />}>
        <div className="flex flex-wrap items-center gap-4">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="size-12 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-lg font-bold text-brand">{(settings.name || user?.email || '?').slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{user?.email}</div>
            <div className="text-xs text-muted">Signed in with {user?.provider === 'email' ? 'email' : user?.provider}. {kitCount} kits saved to your account.</div>
          </div>
          <Button variant="secondary" onClick={() => signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">Display name</span>
          <input className={input} value={settings.name} onChange={(e) => updateSettings({ name: e.target.value })} />
        </label>
        {isEmailUser && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault()
              setPwStatus({ busy: true })
              const { error } = await supabase.auth.updateUser({ password })
              setPwStatus(error ? { error } : { ok: true })
              if (!error) setPassword('')
            }}
          >
            <span className="block text-sm font-semibold">Change password</span>
            <div className="flex gap-2">
              <input type="password" minLength={6} className={input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
              <Button type="submit" variant="secondary" disabled={password.length < 6} loading={pwStatus.busy}>
                Update
              </Button>
            </div>
            {pwStatus.ok && <p className="flex items-center gap-1 text-sm text-good"><Check className="size-4" /> Password updated.</p>}
            {pwStatus.error ? <ErrorBox error={pwStatus.error} /> : null}
          </form>
        )}
      </Section>

      <Section title="Appearance & study" icon={<Sun className="size-5 text-citrus" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">Theme</span>
          <Segmented<Theme>
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">Smart Study round length</span>
          <Segmented value={settings.questionsPerRound} onChange={(questionsPerRound) => updateSettings({ questionsPerRound })} options={[5, 10, 15, 20].map((n) => ({ value: n, label: String(n) }))} />
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">Default AI language for new kits</span>
          <select className={input} value={settings.language} onChange={(e) => updateSettings({ language: e.target.value })}>
            <option value="auto">Same as material</option>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="AI model" icon={<Cpu className="size-5 text-brand" />}>
        <p className="text-sm text-muted">aehT runs on Google Gemini. The default model alias always points at Google's latest Flash model.</p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">Text model</span>
          {textModels?.length ? (
            <select className={input} value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
              {!textModels.some((m) => m.name === settings.model) && <option value={settings.model}>{settings.model}</option>}
              {textModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName} ({m.name})
                </option>
              ))}
            </select>
          ) : (
            <input className={input} value={settings.model} onChange={(e) => updateSettings({ model: e.target.value.trim() })} placeholder={DEFAULT_MODEL} />
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">Podcast voice model</span>
          {ttsModels?.length ? (
            <select className={input} value={settings.ttsModel} onChange={(e) => updateSettings({ ttsModel: e.target.value })}>
              {!ttsModels.some((m) => m.name === settings.ttsModel) && <option value={settings.ttsModel}>{settings.ttsModel}</option>}
              {ttsModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName} ({m.name})
                </option>
              ))}
            </select>
          ) : (
            <input className={input} value={settings.ttsModel} onChange={(e) => updateSettings({ ttsModel: e.target.value.trim() })} placeholder={DEFAULT_TTS_MODEL} />
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={runTest} loading={aiStatus.busy === 'test'}>
            Test connection
          </Button>
          <Button variant="secondary" size="sm" onClick={loadModels} loading={aiStatus.busy === 'models'}>
            Load available models
          </Button>
          <Button variant="ghost" size="sm" onClick={() => updateSettings({ model: DEFAULT_MODEL, ttsModel: DEFAULT_TTS_MODEL })}>
            Reset to defaults
          </Button>
        </div>
        {aiStatus.ok && <p className="flex items-center gap-1 text-sm text-good"><Check className="size-4" /> {aiStatus.ok}</p>}
        {aiStatus.error ? <ErrorBox error={aiStatus.error} /> : null}

        <details className="rounded-xl border border-line p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4" /> Use my own Gemini API key (optional)
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted">
              By default aehT uses this site's shared key on the server. If you'd rather use your own quota, paste a key from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-brand underline">
                Google AI Studio
              </a>
              . It is stored only in this browser and sent only to Google.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type={showKey ? 'text' : 'password'} className={input + ' pr-10 font-mono'} value={ownKey} onChange={(e) => setOwnKey(e.target.value)} placeholder="AQ.… or AIza…" autoComplete="off" spellCheck={false} />
                <button type="button" onClick={() => setShowKey((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-muted" aria-label={showKey ? 'Hide key' : 'Show key'}>
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button variant="secondary" onClick={() => updateSettings({ apiKey: ownKey.trim() })} disabled={ownKey.trim() === settings.apiKey}>
                Save
              </Button>
              {settings.apiKey && (
                <Button variant="ghost" onClick={() => (setOwnKey(''), updateSettings({ apiKey: '' }))}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{settings.apiKey ? 'Using your own key in this browser.' : 'Using the shared server key.'}</p>
          </div>
        </details>
      </Section>

      <Section title="Your data" icon={<Download className="size-5 text-brand" />}>
        <p className="text-sm text-muted">Everything is saved to your account automatically. You can also keep a backup file or move kits between accounts.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={async () => downloadFile(`aeht-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), 'application/json')}>
            <Download className="size-4" /> Export backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const n = await importAll(await f.text())
                setDataMsg({ ok: `Imported ${n} kit${n === 1 ? '' : 's'}.` })
              } catch (error) {
                setDataMsg({ error })
              }
            }}
          />
          <Button
            variant="ghost"
            className="text-bad"
            onClick={async () => {
              if (!confirm('Delete ALL your kits, folders, progress and uploaded files? This cannot be undone.')) return
              try {
                await wipeAll()
                setDataMsg({ ok: 'All data deleted.' })
              } catch (error) {
                setDataMsg({ error })
              }
            }}
          >
            <Trash2 className="size-4" /> Delete all my data
          </Button>
        </div>
        {dataMsg.ok && <p className="text-sm text-good">{dataMsg.ok}</p>}
        {dataMsg.error ? <ErrorBox error={dataMsg.error} /> : null}
      </Section>

      <p className="pb-4 text-center text-xs text-muted">
        aehT is free and open source (MIT). It is an independent project and is not affiliated with any commercial study app.
      </p>
    </div>
  )
}
