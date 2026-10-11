import '../style.css'

const FEED_URL = 'https://www.astronomy.com/tags/sky-this-week/feed/'
const SITE_URL = 'https://www.astronomy.com/tags/sky-this-week/'
const WEEKS = 4 // "Sky This Week" is weekly, so 4 items is about a month
const CACHE_KEY = 'sky-feed-cache'

// Browsers block cross-origin requests unless the server allows them, so we
// can't fetch the feed directly. Sources are tried in order:
//   1. Our own Vite dev proxy (see vite.config.ts; local development only)
//   2. Public CORS proxies
// If all of them fail, we fall back to the last copy saved in localStorage.
const FEED_SOURCES = [
  () => '/api/sky-feed',
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]

const dialog = document.getElementById('events-dialog')
const status = document.getElementById('events-status')
const list = document.getElementById('events-list')
const external = document.getElementById('events-external')

external.href = SITE_URL

// ---------- fetching + parsing ----------

function parseFeed(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  return doc.querySelector('parsererror') || !doc.querySelector('item') ? null : doc
}

async function fetchFeedDocument() {
  for (const build of FEED_SOURCES) {
    try {
      const res = await fetch(build(FEED_URL), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const text = await res.text()
      const doc = parseFeed(text)
      if (!doc) continue
      try {
        localStorage.setItem(CACHE_KEY, text)
      } catch {
        // storage unavailable: skip caching
      }
      return doc
    } catch {
      // timeout, network error or CORS failure: try the next source
    }
  }

  // Every source failed: fall back to the last good copy, if there is one
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    const doc = cached && parseFeed(cached)
    if (doc) return doc
  } catch {
    // ignore
  }

  throw new Error('Could not load the feed')
}

// Feed descriptions are HTML. Parse them and keep only the text, so nothing
// from the feed is ever inserted into the page as markup.
function toPlainText(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text
    .replace(/The post .* appeared first on .*$/i, '') // WordPress boilerplate
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text, max = 300) {
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function parseItems(doc) {
  return [...doc.querySelectorAll('item')]
    .map((item) => {
      const get = (tag) => item.querySelector(tag)?.textContent?.trim() ?? ''
      return {
        title: get('title'),
        link: get('link'),
        time: Date.parse(get('pubDate')) || 0,
        summary: truncate(toPlainText(get('description'))),
      }
    })
    .filter((i) => i.title && isHttpUrl(i.link))
    .sort((a, b) => b.time - a.time)
    .slice(0, WEEKS)
}

// ---------- rendering ----------

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

function renderItems(items) {
  list.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li')
      li.className = 'border-b border-moon/15 py-5 first:pt-0 last:border-b-0'

      const h3 = document.createElement('h3')
      h3.className = 'font-display text-xl font-semibold'
      const a = document.createElement('a')
      a.href = item.link
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = item.title
      a.className = 'hover:text-aurora underline-offset-4 hover:underline'
      h3.append(a)
      li.append(h3)

      if (item.time) {
        const time = document.createElement('time')
        time.dateTime = new Date(item.time).toISOString()
        time.textContent = dateFormat.format(item.time)
        time.className = 'mt-1 block text-sm text-moon/60'
        li.append(time)
      }

      if (item.summary) {
        const p = document.createElement('p')
        p.className = 'mt-3 leading-relaxed text-moon/80'
        p.textContent = item.summary
        li.append(p)
      }
      return li
    }),
  )
}

function setStatus(message, { showFallback = false } = {}) {
  status.replaceChildren(message)
  if (showFallback) {
    const a = document.createElement('a')
    a.href = SITE_URL
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = 'Read it on Astronomy.com'
    a.className = 'text-aurora underline underline-offset-4'
    status.append(' ', a, '.')
  }
  status.hidden = !message
}

let loaded = false
let loading = false

async function loadEvents() {
  if (loaded || loading) return
  loading = true
  setStatus('Loading this month’s sky events…')
  try {
    const items = parseItems(await fetchFeedDocument())
    if (!items.length) throw new Error('No items')
    renderItems(items)
    setStatus('')
    loaded = true
  } catch {
    setStatus('We couldn’t load the sky events feed right now.', { showFallback: true })
  } finally {
    loading = false
  }
}

// ---------- dialog ----------

document.getElementById('events-open').addEventListener('click', () => {
  dialog.showModal()
  loadEvents() // runs on first open, and retries after a failure
})

document.getElementById('events-close').addEventListener('click', () => dialog.close())

// Clicking the dimmed backdrop closes the dialog
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})

// ---------- iframe dialogs (dark skies map, star map) ----------

function setupFrameDialog({ openId, closeId, dialogId, frameId, url }) {
  const dlg = document.getElementById(dialogId)
  const frame = document.getElementById(frameId)

  document.getElementById(openId).addEventListener('click', () => {
    if (!frame.getAttribute('src')) frame.src = url // load on first open
    dlg.showModal()
  })

  document.getElementById(closeId).addEventListener('click', () => dlg.close())

  // Clicking the dimmed backdrop closes the dialog
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close()
  })
}

setupFrameDialog({
  openId: 'map-open',
  closeId: 'map-close',
  dialogId: 'map-dialog',
  frameId: 'map-frame',
  url: '/dark-sky-map.html',
})

setupFrameDialog({
  openId: 'starmap-open',
  closeId: 'starmap-close',
  dialogId: 'starmap-dialog',
  frameId: 'starmap-frame',
  url: 'https://ofrohn.github.io/celestial-demo/location.html',
})