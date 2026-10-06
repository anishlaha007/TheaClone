export function uid(prefix = ''): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14)
  return prefix + rand
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function dayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Consecutive-day streak ending today (or yesterday, so a streak isn't "lost" before you study today). */
export function computeStreak(days: string[]): number {
  const set = new Set(days)
  const d = new Date()
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let streak = 0
  while (set.has(dayKey(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function timeAgo(ts?: number): string {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Loose comparison for typed answers: case, accents, punctuation and articles are ignored. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** True when `given` matches one of `accepted` exactly or with a small typo. */
export function fuzzyMatch(given: string, accepted: string[]): boolean {
  const g = normalizeAnswer(given)
  if (!g) return false
  return accepted.some((a) => {
    const n = normalizeAnswer(a)
    if (!n) return false
    if (n === g) return true
    const tolerance = n.length <= 4 ? 0 : n.length <= 8 ? 1 : 2
    return levenshtein(n, g) <= tolerance
  })
}

export function downloadFile(name: string, content: BlobPart, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'kit'
}

export function speak(text: string, lang?: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (lang) u.lang = lang
  window.speechSynthesis.speak(u)
}

export const KIT_COLORS = ['#0E7C66', '#2F6FDE', '#B5487E', '#D9822B', '#6E56CF', '#1F8A9E', '#C2453D', '#4E7A2F']

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
