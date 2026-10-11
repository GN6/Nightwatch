import '../style.css'

const SITE_URL = 'https://www.astronomy.com/tags/sky-this-week/'

const dialog = document.getElementById('events-dialog')
const status = document.getElementById('events-status')
const list = document.getElementById('events-list')
const external = document.getElementById('events-external')
const refreshBtn = document.getElementById('events-refresh')

external.href = SITE_URL

// ---------- fetching ----------

async function fetchEvents(refresh = false) {
  const res = await fetch(`/api/sky-events${refresh ? '?refresh=true' : ''}`, {
    signal: AbortSignal.timeout(30000), // Gemini retries can take a while
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return res.json()
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// ---------- rendering ----------

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

function renderItems(items) {
  list.replaceChildren(
    ...items
      .filter((i) => i.title && isHttpUrl(i.link))
      .map((item) => {
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

        const t = Date.parse(item.published) || 0
        if (t) {
          const time = document.createElement('time')
          time.dateTime = new Date(t).toISOString()
          time.textContent = dateFormat.format(t)
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

async function loadEvents(refresh = false) {
  if (loading || (loaded && !refresh)) return
  loading = true
  refreshBtn.disabled = true
  setStatus(refresh ? 'Refreshing…' : 'Summarizing this month’s sky events with Gemini…')
  try {
    const items = await fetchEvents(refresh)
    if (!items.length) throw new Error('No items')
    renderItems(items)
    setStatus('')
    loaded = true
  } catch (err) {
    console.error(err)
    setStatus('We couldn’t load the sky events right now.', { showFallback: true })
  } finally {
    loading = false
    refreshBtn.disabled = false
  }
}

// ---------- events dialog ----------

document.getElementById('events-open').addEventListener('click', () => {
  dialog.showModal()
  loadEvents()
})
refreshBtn.addEventListener('click', () => loadEvents(true))
document.getElementById('events-close').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})

// ---------- dark skies map dialog ----------

const MAP_URL = '/dark-sky-map.html'
const mapDialog = document.getElementById('map-dialog')
const mapFrame = document.getElementById('map-frame')

document.getElementById('map-open').addEventListener('click', () => {
  if (!mapFrame.getAttribute('src')) mapFrame.src = MAP_URL
  mapDialog.showModal()
})
document.getElementById('map-close').addEventListener('click', () => mapDialog.close())
mapDialog.addEventListener('click', (e) => {
  if (e.target === mapDialog) mapDialog.close()
})