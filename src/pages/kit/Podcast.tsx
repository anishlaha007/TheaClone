import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Headphones, Play, Pause, Download, RefreshCw, Wand2 } from 'lucide-react'
import { useKitContext, useSource } from './KitLayout'
import { loadPodcastAudio, recordStudy, savePodcastAudio, updateKit } from '../../lib/store'
import { HOSTS, writePodcast } from '../../lib/ai'
import { synthesizeDialogue } from '../../lib/gemini'
import { Button, EmptyState, ErrorBox, Panel, Segmented, Spinner } from '../../components/ui'
import { downloadFile, slugify } from '../../lib/utils'

/** Browser speech fallback: reads the script with two different system voices. */
function useDeviceVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load)
      speechSynthesis.cancel()
    }
  }, [])
  return voices
}

export default function Podcast() {
  const { kit } = useKitContext()
  const { getSource } = useSource(kit)
  const [minutes, setMinutes] = useState(5)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [speakingLine, setSpeakingLine] = useState<number | null>(null)
  const voices = useDeviceVoices()
  const stopRef = useRef(false)
  const pod = kit.podcast

  useEffect(() => {
    let url: string | null = null
    if (pod?.hasAudio) {
      loadPodcastAudio(kit.id).then((blob) => {
        if (blob) {
          url = URL.createObjectURL(blob)
          setAudioUrl(url)
        }
      })
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [kit.id, pod?.hasAudio, pod?.createdAt])

  async function writeScript() {
    setError(null)
    setBusy('Writing the episode…')
    try {
      const { title, lines } = await writePodcast(kit, await getSource(), minutes)
      setAudioUrl(null)
      updateKit(kit.id, { podcast: { title, hosts: HOSTS, lines, createdAt: Date.now(), hasAudio: false } })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function makeAudio() {
    if (!pod) return
    setError(null)
    try {
      const blob = await synthesizeDialogue(pod.lines, pod.hosts, (d, t) => setBusy(`Recording audio… ${Math.round((d / t) * 100)}%`))
      setBusy('Saving…')
      await savePodcastAudio(kit.id, blob)
      setAudioUrl(URL.createObjectURL(blob))
      updateKit(kit.id, { podcast: { ...pod, hasAudio: true } })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  function playWithDevice(from = 0) {
    if (!pod || !('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    stopRef.current = false
    const lang = voices.filter((v) => v.lang.startsWith(navigator.language.slice(0, 2)))
    const pool = lang.length >= 2 ? lang : voices
    const v0 = pool[0]
    const v1 = pool.find((v) => v !== v0 && v.name !== v0?.name) || pool[1] || v0
    const speakLine = (i: number) => {
      if (stopRef.current || i >= pod.lines.length) {
        setSpeakingLine(null)
        if (i >= pod.lines.length) recordStudy(kit.id)
        return
      }
      setSpeakingLine(i)
      const u = new SpeechSynthesisUtterance(pod.lines[i].text)
      const voice = pod.lines[i].speaker === pod.hosts[0] ? v0 : v1
      if (voice) u.voice = voice
      u.pitch = pod.lines[i].speaker === pod.hosts[0] ? 1.1 : 0.9
      u.rate = 1.03
      u.onend = () => speakLine(i + 1)
      speechSynthesis.speak(u)
    }
    speakLine(from)
  }

  function stopDevice() {
    stopRef.current = true
    speechSynthesis.cancel()
    setSpeakingLine(null)
  }

  if (!pod) {
    return (
      <EmptyState
        icon={<Headphones className="size-7" />}
        title="Study podcast"
        body={`${HOSTS[0]} and ${HOSTS[1]} talk through your material in a two-host episode, with a recap and quiz questions at the end.`}
        action={
          <div className="flex flex-col items-center gap-4">
            <Segmented value={minutes} onChange={setMinutes} options={[3, 5, 10].map((m) => ({ value: m, label: `${m} min` }))} />
            <Button onClick={writeScript} loading={!!busy}>
              {busy || 'Create episode'}
            </Button>
            {error ? <ErrorBox error={error} /> : null}
          </div>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Panel className="overflow-hidden">
        <div className="flex items-center gap-4 bg-ink p-6 text-bg">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-citrus text-3xl">{kit.emoji}</div>
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-wide uppercase opacity-70">aehT podcast</div>
            <h2 className="truncate font-display text-2xl font-bold">{pod.title}</h2>
            <div className="text-sm opacity-70">
              with {pod.hosts[0]} &amp; {pod.hosts[1]}
            </div>
          </div>
        </div>
        <div className="space-y-3 p-5">
          {audioUrl ? (
            <div className="flex items-center gap-3">
              <audio src={audioUrl} controls className="w-full" onEnded={() => recordStudy(kit.id)} />
              <button onClick={() => fetch(audioUrl).then((r) => r.blob()).then((b) => downloadFile(`${slugify(kit.title)}-podcast.wav`, b, 'audio/wav'))} className="rounded-xl p-2.5 text-muted hover:bg-surface-2" aria-label="Download audio">
                <Download className="size-5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={makeAudio} loading={!!busy}>
                <Wand2 className="size-4" /> {busy || 'Generate studio audio'}
              </Button>
              {speakingLine === null ? (
                <Button variant="secondary" onClick={() => playWithDevice()} disabled={!!busy}>
                  <Play className="size-4" /> Play with device voice
                </Button>
              ) : (
                <Button variant="secondary" onClick={stopDevice}>
                  <Pause className="size-4" /> Stop
                </Button>
              )}
            </div>
          )}
          {error ? <ErrorBox error={error} /> : null}
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Transcript</h3>
        <div className="flex items-center gap-2">
          <Segmented value={minutes} onChange={setMinutes} options={[3, 5, 10].map((m) => ({ value: m, label: `${m}m` }))} />
          <Button variant="ghost" size="sm" onClick={writeScript} disabled={!!busy}>
            <RefreshCw className="size-4" /> New episode
          </Button>
        </div>
      </div>
      {busy && busy.startsWith('Writing') ? (
        <Spinner label={busy} />
      ) : (
        <div className="space-y-3">
          {pod.lines.map((l, i) => {
            const first = l.speaker === pod.hosts[0]
            return (
              <div key={i} className={clsx('flex gap-3', !first && 'flex-row-reverse')}>
                <span className={clsx('grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold', first ? 'bg-brand text-brand-ink' : 'bg-citrus text-[#1d1606]')}>{l.speaker[0]}</span>
                <button
                  onClick={() => !audioUrl && playWithDevice(i)}
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-left text-sm transition',
                    first ? 'rounded-tl-sm bg-surface' : 'rounded-tr-sm bg-surface-2',
                    speakingLine === i && 'ring-2 ring-brand',
                  )}
                >
                  {l.text}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
