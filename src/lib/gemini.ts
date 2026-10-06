import { getState, uploadSourceFile } from './store'

/**
 * Minimal Gemini REST client.
 *
 * By default every request goes through this app's own server function
 * (/api/gemini), which adds the deployment's GEMINI_API_KEY on the server,
 * so the key never reaches the browser. Signed-in users only.
 *
 * Optionally a user can paste a personal key in Settings; requests then go
 * straight to Google with that key (works with "AQ." auth keys and legacy
 * "AIza" keys, sent in the x-goog-api-key header, never in the URL).
 */

const API = 'https://generativelanguage.googleapis.com'

function ownKey(): string {
  return getState().settings.apiKey.trim()
}

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType?: string } }

export type Content = { role: 'user' | 'model'; parts: Part[] }

export class GeminiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

export class NotSignedInError extends GeminiError {
  constructor() {
    super('Please sign in to use AI features.', 401)
  }
}

function friendlyError(status: number, raw: string, model?: string): GeminiError {
  let msg = raw
  try {
    const j = JSON.parse(raw)
    msg = j?.error?.message || raw
  } catch {
    /* keep raw */
  }
  if (status === 400 && /api key/i.test(msg)) return new GeminiError('Your Gemini API key was rejected. Check it in Settings.', status)
  if (status === 401 || status === 403)
    return new GeminiError(`Gemini refused the request (${status}). Check that your API key is valid and the Gemini API is enabled for its project. ${msg}`, status)
  if (status === 404)
    return new GeminiError(`Model "${model}" was not found. Pick another model in Settings → AI model. (${msg})`, status)
  if (status === 429 && /daily/i.test(msg)) return new GeminiError(msg, status)
  if (status === 429)
    return new GeminiError('Gemini rate limit or quota reached. Wait a minute and try again, or check your quota in Google AI Studio.', status)
  if (status === 503 && /GEMINI_API_KEY/.test(msg)) return new GeminiError(msg, status)
  if (status >= 500) return new GeminiError('Gemini is busy right now. Please try again in a moment.', status)
  return new GeminiError(msg || `Request failed (${status})`, status)
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const own = ownKey()
  if (own) {
    return fetch(`${API}${path}`, { ...init, headers: { 'x-goog-api-key': own, ...(init.headers || {}) } })
  }
  const token = getState().session?.access_token
  if (!token) throw new NotSignedInError()
  return fetch(`/api/gemini?path=${encodeURIComponent(path)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
}

async function request(path: string, init: RequestInit & { model?: string }, retries = 2): Promise<Response> {
  const { model: _model, ...fetchInit } = init
  void _model
  const res = await send(path, fetchInit)
  if (res.ok) return res
  if ((res.status === 429 || res.status === 503 || res.status === 500) && retries > 0 && !init.signal?.aborted) {
    await new Promise((r) => setTimeout(r, (3 - retries) * 2000 + 1000))
    return request(path, init, retries - 1)
  }
  throw friendlyError(res.status, await res.text(), init.model)
}

type GenOptions = {
  contents: Content[]
  system?: string
  temperature?: number
  schema?: object
  maxOutputTokens?: number
  tools?: object[]
  model?: string
  signal?: AbortSignal
}

function buildBody(o: GenOptions) {
  const generationConfig: Record<string, unknown> = {}
  if (o.temperature !== undefined) generationConfig.temperature = o.temperature
  if (o.maxOutputTokens) generationConfig.maxOutputTokens = o.maxOutputTokens
  if (o.schema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = o.schema
  }
  return JSON.stringify({
    contents: o.contents,
    ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    ...(o.tools ? { tools: o.tools } : {}),
    generationConfig,
  })
}

type Candidate = { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] }; finishReason?: string }
type GenResponse = { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } }

function textOf(r: GenResponse): string {
  if (r.promptFeedback?.blockReason) throw new GeminiError(`Gemini blocked this request (${r.promptFeedback.blockReason}).`)
  const c = r.candidates?.[0]
  const text = (c?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('')
  if (!text && c?.finishReason && c.finishReason !== 'STOP') throw new GeminiError(`Gemini stopped early (${c.finishReason}). Try again or use less material.`)
  return text
}

export async function generate(o: GenOptions): Promise<string> {
  const model = o.model || getState().settings.model
  const res = await request(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildBody(o),
    signal: o.signal,
    model,
  })
  return textOf(await res.json())
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T
    throw new GeminiError('Gemini returned an unexpected response. Please try again.')
  }
}

export async function generateJSON<T>(o: GenOptions & { schema: object }): Promise<T> {
  return parseJSON<T>(await generate(o))
}

/** Streams text via server-sent events. Calls onText with the full text so far. */
export async function streamText(o: GenOptions & { onText: (full: string) => void }): Promise<string> {
  const model = o.model || getState().settings.model
  const res = await request(`/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildBody(o),
    signal: o.signal,
    model,
  })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload) as GenResponse
        const t = (chunk.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('')
        if (t) {
          full += t
          o.onText(full)
        }
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
  return full
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/**
 * Inline uploads are fastest. Through the app server the request body is
 * capped (Vercel allows ~4.5 MB), so bigger files are first stored in the
 * user's private Supabase bucket and handed to Gemini's Files API by the
 * server. With a personal key, big files go to the Files API directly.
 */
export async function filePart(file: File, onStatus?: (s: string) => void, storedPath?: string): Promise<Part> {
  const mimeType = file.type || 'application/octet-stream'
  const own = ownKey()
  const inlineLimit = own ? 15 * 1024 * 1024 : 3 * 1024 * 1024
  if (file.size <= inlineLimit) {
    return { inlineData: { mimeType, data: await blobToBase64(file) } }
  }
  if (!own) {
    onStatus?.(`Uploading ${file.name}…`)
    const storagePath = storedPath || (await uploadSourceFile(file))
    onStatus?.(`Sending ${file.name} to Gemini…`)
    const token = getState().session?.access_token
    if (!token) throw new NotSignedInError()
    const res = await fetch('/api/gemini?action=upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: storagePath, mimeType, name: file.name }),
    })
    if (!res.ok) throw friendlyError(res.status, await res.text())
    const f = (await res.json()) as { fileUri: string; mimeType: string }
    return { fileData: { fileUri: f.fileUri, mimeType: f.mimeType || mimeType } }
  }
  onStatus?.(`Uploading ${file.name}…`)
  const boundary = 'aeht' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ file: { displayName: file.name.slice(0, 120) } })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--\r\n`,
  ])
  const res = await request('/upload/v1beta/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, 'X-Goog-Upload-Protocol': 'multipart' },
    body,
  })
  let f = (await res.json()).file as { name: string; uri: string; mimeType: string; state?: string }
  // Video/audio need server-side processing before they can be used.
  for (let i = 0; f.state === 'PROCESSING' && i < 120; i++) {
    onStatus?.(`Processing ${file.name}…`)
    await new Promise((r) => setTimeout(r, 2500))
    f = await (await request(`/v1beta/${f.name}`, { method: 'GET' })).json()
  }
  if (f.state === 'FAILED') throw new GeminiError(`Gemini could not process ${file.name}.`)
  return { fileData: { fileUri: f.uri, mimeType: f.mimeType || mimeType } }
}

export type ModelInfo = { name: string; displayName: string; methods: string[] }

export async function listModels(): Promise<ModelInfo[]> {
  const out: ModelInfo[] = []
  let pageToken = ''
  for (let i = 0; i < 5; i++) {
    const res = await request(`/v1beta/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`, { method: 'GET' }, 0)
    const j = await res.json()
    for (const m of j.models || []) {
      out.push({ name: String(m.name).replace(/^models\//, ''), displayName: m.displayName || m.name, methods: m.supportedGenerationMethods || [] })
    }
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return out
}

export async function testKey(): Promise<string> {
  const text = await generate({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }], maxOutputTokens: 256 })
  return text.trim()
}

// ---- text to speech --------------------------------------------------------

function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Blob {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const write = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  write(36, 'data')
  v.setUint32(40, pcm.length, true)
  return new Blob([header, pcm as BlobPart], { type: 'audio/wav' })
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const TTS_VOICES: [string, string] = ['Kore', 'Puck']

/** Renders a two-host script to a WAV file using Gemini's multi-speaker TTS. */
export async function synthesizeDialogue(
  lines: { speaker: string; text: string }[],
  hosts: [string, string],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const model = getState().settings.ttsModel
  const chunks: { speaker: string; text: string }[][] = []
  for (let i = 0; i < lines.length; i += 14) chunks.push(lines.slice(i, i + 14))
  const pcm: Uint8Array[] = []
  let rate = 24000
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i, chunks.length)
    const script = chunks[i].map((l) => `${l.speaker}: ${l.text}`).join('\n')
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Read this friendly, upbeat study podcast conversation between ${hosts[0]} and ${hosts[1]}:\n${script}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: hosts.map((h, idx) => ({ speaker: h, voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICES[idx] } } })),
          },
        },
      },
    })
    const res = await request(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
      model,
    })
    const j = (await res.json()) as GenResponse
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    if (!part?.inlineData) throw new GeminiError('The speech model returned no audio.')
    const m = /rate=(\d+)/.exec(part.inlineData.mimeType)
    if (m) rate = Number(m[1])
    pcm.push(b64ToBytes(part.inlineData.data))
  }
  onProgress?.(chunks.length, chunks.length)
  const total = pcm.reduce((n, p) => n + p.length, 0)
  const merged = new Uint8Array(total)
  let off = 0
  for (const p of pcm) {
    merged.set(p, off)
    off += p.length
  }
  return pcmToWav(merged, rate)
}
