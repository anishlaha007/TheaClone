/**
 * Turns uploaded files into text locally where possible (fast, free, private),
 * and flags everything else (scans, photos of handwriting, audio, video) for
 * Gemini to read.
 */

export type Extracted = {
  file: File
  name: string
  mime: string
  /** text extracted in the browser, if any */
  text?: string
  /** the file itself must be sent to Gemini (images, audio, video, scanned PDFs) */
  needsAI: boolean
}

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|xml|rtf|tex|bib|py|js|jsx|ts|tsx|java|kt|c|h|cpp|hpp|cs|rb|go|rs|php|swift|sql|ya?ml|toml|ini|srt|vtt|log|r|m|scala|sh)$/i
const HTML_EXT = /\.(html?|xhtml)$/i

export const ACCEPT =
  '.pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.tex,.srt,.vtt,.py,.js,.ts,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.swift,.sql,.yaml,.yml,image/*,audio/*,video/*'

function guessMime(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    heic: 'image/heic',
    heif: 'image/heif',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

async function pdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    const lines: string[] = []
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) {
        lines.push(line)
        line = ''
      }
    }
    if (line) lines.push(line)
    out.push(`--- Page ${i} ---\n${lines.join('\n')}`)
  }
  return { text: out.join('\n\n'), pages: doc.numPages }
}

async function docxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return res.value
}

async function pptxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideNum = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] || 0)
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => slideNum(a) - slideNum(b))
  const parts: string[] = []
  for (const path of slides) {
    const xml = await zip.file(path)!.async('string')
    const paragraphs = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).filter(Boolean)
    const notesPath = `ppt/notesSlides/notesSlide${slideNum(path)}.xml`
    let notes = ''
    if (zip.file(notesPath)) {
      const nx = await zip.file(notesPath)!.async('string')
      notes = [...nx.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' ').trim()
    }
    parts.push(`--- Slide ${slideNum(path)} ---\n${decodeXml(paragraphs.join('\n'))}${notes ? `\nSpeaker notes: ${decodeXml(notes)}` : ''}`)
  }
  return parts.join('\n\n')
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove())
  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Downscale big photos (e.g. phone pictures of notes) so they upload quickly. */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function extractFile(input: File): Promise<Extracted> {
  const mime = guessMime(input)
  const name = input.name
  if (mime.startsWith('image/')) {
    const file = await shrinkImage(input)
    return { file, name, mime: file.type || mime, needsAI: true }
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return { file: input, name, mime, needsAI: true }
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    try {
      const { text, pages } = await pdfText(input)
      const letters = text.replace(/--- Page \d+ ---/g, '').replace(/\s/g, '').length
      // Scanned or image-only PDFs have (almost) no text layer: let Gemini read them.
      if (letters / Math.max(1, pages) < 80) return { file: input, name, mime: 'application/pdf', needsAI: true }
      return { file: input, name, mime: 'application/pdf', text, needsAI: false }
    } catch {
      return { file: input, name, mime: 'application/pdf', needsAI: true }
    }
  }
  if (/\.docx$/i.test(name)) return { file: input, name, mime, text: await docxText(input), needsAI: false }
  if (/\.pptx$/i.test(name)) return { file: input, name, mime, text: await pptxText(input), needsAI: false }
  if (HTML_EXT.test(name) || mime === 'text/html') return { file: input, name, mime, text: htmlText(await input.text()), needsAI: false }
  if (TEXT_EXT.test(name) || mime.startsWith('text/') || mime === 'application/json') {
    return { file: input, name, mime, text: await input.text(), needsAI: false }
  }
  if (/\.(doc|ppt|xls|xlsx|pages|key|numbers)$/i.test(name)) {
    throw new Error(`${name}: please export this file as PDF (or .docx / .pptx) and upload that instead.`)
  }
  throw new Error(`${name}: this file type isn't supported yet.`)
}

export function parseYouTube(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\.|^m\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1)
    else if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else {
        const m = /^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname)
        if (m) id = m[2]
      }
    }
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
  } catch {
    return null
  }
}

export function isUrl(s: string) {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Parses "term<TAB>definition" / "term - definition" lines (e.g. exported from other flashcard apps). */
export function parseCardList(text: string): { term: string; definition: string }[] {
  const out: { term: string; definition: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^(.+?)\s*(?:\t|\s[-–—:]\s|;|,)\s*(.+)$/.exec(line)
    if (m) out.push({ term: m[1].trim(), definition: m[2].trim() })
  }
  return out
}
