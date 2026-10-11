const id = new URLSearchParams(location.search).get('s')

if (id) {
  const dlg = document.getElementById('shared-dialog')
  const title = document.getElementById('shared-title')
  const statusEl = document.getElementById('shared-status')
  const consts = document.getElementById('shared-consts')
  const grid = document.getElementById('shared-photos')

  document.getElementById('shared-close').addEventListener('click', () => dlg.close())
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close() })
  dlg.showModal()
  statusEl.textContent = 'Loading…'

  fetch(`/api/shared/${encodeURIComponent(id)}`)
    .then((res) => {
      if (!res.ok) throw new Error('not found')
      return res.json()
    })
    .then((data) => {
      title.textContent = data.displayName ? `${data.displayName}'s sky log` : 'A Nightwatch sky log'
      statusEl.textContent = data.constellations.length || data.photos.length ? '' : 'Nothing shared yet.'

      consts.replaceChildren(...data.constellations.map((name) => {
        const s = document.createElement('span')
        s.textContent = `★ ${name}`
        s.className = 'rounded-full border border-aurora bg-aurora/15 px-3 py-1 text-sm text-aurora'
        return s
      }))

      grid.replaceChildren(...data.photos.map((ph) => {
        const fig = document.createElement('figure')
        fig.className = 'overflow-hidden rounded-xl border border-moon/20 bg-moon/5'
        const img = document.createElement('img')
        img.src = ph.image
        img.alt = ph.caption || `${ph.constellation} photo`
        img.className = 'aspect-square w-full object-cover'
        const cap = document.createElement('figcaption')
        cap.className = 'p-3 text-sm'
        const n = document.createElement('p')
        n.className = 'font-medium text-aurora'
        n.textContent = ph.constellation
        const t = document.createElement('p')
        t.className = 'mt-1 text-moon/75'
        t.textContent = ph.caption
        cap.append(n, t)
        fig.append(img, cap)
        return fig
      }))
    })
    .catch(() => {
      title.textContent = 'Profile not found'
      statusEl.textContent = 'This link may have been turned off.'
    })
}