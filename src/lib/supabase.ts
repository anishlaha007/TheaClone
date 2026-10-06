import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined
const key = (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

export const supabaseConfigured = Boolean(url && key)

let leaving = false
/** Called when the tab is being hidden/closed so the final saves can outlive the page. */
export function markLeaving(value: boolean) {
  leaving = value
}

function fetchWithKeepalive(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (leaving && init?.method && init.method !== 'GET') {
    // keepalive lets a request finish after the page unloads (bodies up to 64 KB);
    // fall back to a normal request if the browser refuses.
    return fetch(input, { ...init, keepalive: true }).catch(() => fetch(input, init))
  }
  return fetch(input, init)
}

export const supabase = createClient(url || 'https://missing.supabase.co', key || 'missing', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchWithKeepalive },
})

/**
 * Fire-and-forget PostgREST write that survives page unload. Used for the
 * final save when a tab closes, where supabase-js's async auth handling
 * would not get the request out in time.
 */
export function restBeacon(method: 'POST' | 'PATCH', path: string, body: unknown, accessToken: string, prefer = 'return=minimal') {
  if (!url || !key) return
  const init: RequestInit = {
    method,
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(body),
  }
  fetch(`${url}/rest/v1/${path}`, init).catch(() => fetch(`${url}/rest/v1/${path}`, { ...init, keepalive: false }).catch(() => {}))
}
