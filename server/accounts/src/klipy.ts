// GIF search through KLIPY (https://klipy.com). The key stays here; the app only asks us.
// Searches are never logged, and KLIPY sees a hash of the user, never the JID.
export type Gif = {
  id: string
  title: string
  preview: string
  url: string
  width: number
  height: number
}

const BASE = process.env['KLIPY_BASE_URL'] || 'https://api.klipy.com/api/v1'
const KEY = process.env['KLIPY_API_KEY'] ?? ''
const PER_PAGE = 24

export const klipyEnabled = KEY !== ''

// Only KLIPY's own CDN: the app loads whatever we hand over.
const CDN = /^https:\/\/static\.klipy\.com\/[A-Za-z0-9/_.-]{1,300}$/
const good = (url: unknown): url is string =>
  typeof url === 'string' && url.length <= 325 && CDN.test(url) && !url.includes('..')

type Variant = { url?: unknown; width?: unknown; height?: unknown }

const size = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 2000

// Untrusted text goes into XML: no control characters or lone surrogates (they would break
// the stream), cut by code points so an emoji is never split.
const clean = (text: string): string =>
  [...text.replace(/\p{Cc}/gu, '').toWellFormed()].slice(0, 100).join('')

function toGif(raw: unknown): Gif | undefined {
  const item = raw as {
    id?: unknown
    title?: unknown
    file?: Record<string, Record<string, Variant>>
  }
  const sm = item?.file?.sm?.webp
  const md = item?.file?.md?.webp
  if (typeof item?.id !== 'number' || !good(sm?.url) || !good(md?.url)) return
  const { width, height } = sm as { width?: unknown; height?: unknown }
  if (!size(width) || !size(height)) return
  return {
    id: String(item.id),
    title: typeof item.title === 'string' ? clean(item.title) : '',
    preview: sm.url,
    url: md.url,
    width,
    height
  }
}

// Throws on any failure (timeout included); the caller answers service-unavailable.
export async function gifs(
  q: string,
  page: number,
  locale: string,
  customer: string
): Promise<{ gifs: Gif[]; more: boolean }> {
  const url = new URL(`${BASE}/${KEY}/gifs/${q ? 'search' : 'trending'}`)
  if (q) url.searchParams.set('q', q)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(PER_PAGE))
  url.searchParams.set('customer_id', customer)
  url.searchParams.set('locale', locale)
  const res = await fetch(
    url,
    { signal: AbortSignal.timeout(8000), redirect: 'error' } // the key is in the URL: never follow it elsewhere
  )
  if (!res.ok) throw new Error(`klipy ${res.status}`) // the URL holds the key: never print it
  const body = (await res.json()) as { data?: { data?: unknown[]; has_next?: unknown } }
  const items = body.data?.data
  if (!Array.isArray(items)) throw new Error('klipy: unexpected answer')
  const more =
    typeof body.data?.has_next === 'boolean' ? body.data.has_next : items.length === PER_PAGE
  return { gifs: items.map(toGif).filter((g): g is Gif => !!g), more }
}
