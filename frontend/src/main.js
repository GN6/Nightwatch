import '../style.css'

const FEED_URL = 'https://www.astronomy.com/tags/sky-this-week/feed/'
const SITE_URL = 'https://www.astronomy.com/tags/sky-this-week/'
const WEEKS = 4 // "Sky This Week" is weekly, so 4 items is about a month

// Browsers block cross-origin requests unless the server allows them, so we
// try the feed directly first, then fall back to public CORS proxies.
const FEED_SOURCES = [
  (u) => u,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]

const dialog = document.getElementById('events-dialog')
const status = document.getElementById('events-status')
const list = document.getElementById('events-list')
const external = document.getElementById('events-external')

external.href = SITE_URL

// ---------- fetching + parsing ----------

async function fetchFeedDocument() {
  for (const build of FEED_SOURCES) {
    try {
      const res = await fetch(build(FEED_URL))
      if (!res.ok) continue
      const doc = new DOMParser().parseFromString(await res.text(), 'text/xml')
      if (doc.querySelector('parsererror') || !doc.querySelector('item')) continue
      return doc
    } catch {
      // network or CORS failure: try the next source
    }
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