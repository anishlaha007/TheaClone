/**
 * Vercel Function: server-side Gemini proxy.
 *
 * The browser never sees GEMINI_API_KEY. Every request must carry a valid
 * Supabase session token; AI generations are counted per user per day
 * (DAILY_AI_LIMIT, default 400) to protect the key's quota.
 *
 *   POST/GET /api/gemini?path=/v1beta/models/<model>:generateContent  → forwarded to Google
 *   POST     /api/gemini?action=upload  { path, mimeType, name }       → Supabase Storage file → Gemini Files API
 */

const GOOGLE = 'https://generativelanguage.googleapis.com'

const ALLOWED_PATHS = [
  /^\/v1beta\/models\/[\w.-]+:(generateContent|streamGenerateContent\?alt=sse)$/,
  /^\/v1beta\/models\?pageSize=\d{1,3}(&pageToken=[\w.~%-]+)?$/,
  /^\/v1beta\/files\/[\w-]+$/,
]

const env = (name: string) => process.env[name] || ''
const supabaseUrl = () => env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL')
const supabaseKey = () => env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY')

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
const fail = (status: number, message: string) => json(status, { error: { message } })

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

/** Verifies the Supabase session token and returns the user id. */
async function verifyUser(token: string): Promise<string | null> {
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const u = (await res.json()) as { id?: string }
  return u.id || null
}

/** Counts one AI request for the user (as that user, through RLS) and returns today's total. */
async function bumpUsage(token: string): Promise<number | null> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/bump_ai_usage`, {
    method: 'POST',
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) return null
  return Number(await res.json())
}

function dailyLimit() {
  const n = Number(env('DAILY_AI_LIMIT'))
  return Number.isFinite(n) && n > 0 ? n : 400
}

async function handle(req: Request): Promise<Response> {
  const key = env('GEMINI_API_KEY')
  if (!key) return fail(503, 'This deployment is missing GEMINI_API_KEY. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.')
  if (!supabaseUrl() || !supabaseKey()) return fail(503, 'This deployment is missing the Supabase environment variables.')

  const token = bearer(req)
  if (!token) return fail(401, 'Please sign in to use AI features.')

  const url = new URL(req.url)
  if (url.searchParams.get('action') === 'upload') return upload(req, token, key)

  const path = url.searchParams.get('path') || ''
  if (!ALLOWED_PATHS.some((r) => r.test(path))) return fail(400, 'Unsupported Gemini request.')

  const isGeneration = req.method === 'POST'
  if (isGeneration) {
    const used = await bumpUsage(token)
    if (used === null) return fail(401, 'Your session expired. Please sign in again.')
    if (used > dailyLimit()) return fail(429, `You've reached today's AI limit (${dailyLimit()} requests). It resets at midnight UTC.`)
  } else if (!(await verifyUser(token))) {
    return fail(401, 'Your session expired. Please sign in again.')
  }

  const upstream = await fetch(`${GOOGLE}${path}`, {
    method: req.method,
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: isGeneration ? await req.arrayBuffer() : undefined,
  })
  // Pass the body straight through so streamed (SSE) responses stay streamed.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  })
}

/** Moves a large file from the user's private Supabase bucket to the Gemini Files API. */
async function upload(req: Request, token: string, key: string): Promise<Response> {
  const uid = await verifyUser(token)
  if (!uid) return fail(401, 'Your session expired. Please sign in again.')
  const { path, mimeType, name } = (await req.json().catch(() => ({}))) as { path?: string; mimeType?: string; name?: string }
  if (!path || !path.startsWith(`${uid}/`) || path.includes('..')) return fail(400, 'Invalid file path.')

  const used = await bumpUsage(token)
  if (used === null) return fail(401, 'Your session expired. Please sign in again.')
  if (used > dailyLimit()) return fail(429, `You've reached today's AI limit (${dailyLimit()} requests). It resets at midnight UTC.`)

  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const file = await fetch(`${supabaseUrl()}/storage/v1/object/authenticated/sources/${encoded}`, {
    headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}` },
  })
  if (!file.ok) return fail(404, 'Could not read the uploaded file from storage.')
  const bytes = await file.arrayBuffer()
  const type = mimeType || file.headers.get('content-type') || 'application/octet-stream'

  const boundary = 'aeht' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ file: { displayName: (name || 'upload').slice(0, 120) } })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--\r\n`,
  ])
  const up = await fetch(`${GOOGLE}/upload/v1beta/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': `multipart/related; boundary=${boundary}`, 'x-goog-upload-protocol': 'multipart' },
    body,
  })
  if (!up.ok) return new Response(await up.text(), { status: up.status, headers: { 'content-type': 'application/json' } })
  let f = ((await up.json()) as { file: { name: string; uri: string; mimeType: string; state?: string } }).file

  // Audio/video are processed asynchronously by Google before they can be used.
  const deadline = Date.now() + 240_000
  while (f.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500))
    const poll = await fetch(`${GOOGLE}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': key } })
    if (!poll.ok) break
    f = (await poll.json()) as typeof f
  }
  if (f.state === 'FAILED') return fail(422, `Gemini could not process ${name || 'the file'}.`)
  if (f.state === 'PROCESSING') return fail(504, `Gemini is still processing ${name || 'the file'}. Try a shorter file.`)
  return json(200, { fileUri: f.uri, mimeType: f.mimeType || type })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
