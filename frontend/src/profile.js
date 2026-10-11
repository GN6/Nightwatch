import { auth, signIn, logOut, onUser, api } from './auth.js'

const CONSTELLATIONS = [
  'Orion', 'Ursa Major', 'Ursa Minor', 'Cassiopeia', 'Cygnus', 'Lyra', 'Aquila',
  'Scorpius', 'Sagittarius', 'Leo', 'Taurus', 'Gemini', 'Canis Major', 'Pegasus',
  'Andromeda', 'Perseus', 'Virgo', 'Libra', 'Cancer', 'Southern Cross',
]

const avatarBtn = document.getElementById('avatar-btn')
const avatarImg = document.getElementById('avatar-img')
const avatarIcon = document.getElementById('avatar-icon')
const dlg = document.getElementById('profile-dialog')
const statusEl = document.getElementById('profile-status')
const picker = document.getElementById('const-picker')
const photoSelect = document.getElementById('photo-const')
const photoFile = document.getElementById('photo-file')
const photoCaption = document.getElementById('photo-caption')
const photoUpload = document.getElementById('photo-upload')
const photoGrid = document.getElementById('photo-grid')
const shareBtn = document.getElementById('share-btn')
const shareBox = document.getElementById('share-box')
const shareLink = document.getElementById('share-link')
const shareCopy = document.getElementById('share-copy')
const shareStop = document.getElementById('share-stop')

function renderShare(id) {
  shareBtn.hidden = !!id
  shareBox.hidden = !id
  if (id) shareLink.value = `${location.origin}/?s=${id}`
}

async function setSharing(enable) {
  try {
    const data = await api(`/api/share?enable=${enable}`, { method: 'POST' })
    renderShare(data.shareId)
  } catch (err) {
    console.error(err)
    setStatus(`Sharing failed: ${err.message}`)
  }
}

shareBtn.addEventListener('click', () => setSharing(true))
shareStop.addEventListener('click', () => setSharing(false))
shareCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    shareCopy.textContent = 'Copied!'
    setTimeout(() => (shareCopy.textContent = 'Copy'), 1500)
  } catch {
    shareLink.select() // clipboard blocked: let them copy manually
  }
})

let saved = new Set()
let photos = []

const setStatus = (msg) => { statusEl.textContent = msg; statusEl.hidden = !msg }

// ---------- rendering ----------

function renderPicker() {
  picker.replaceChildren(...CONSTELLATIONS.map((name) => {
    const on = saved.has(name)
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `${on ? '★' : '☆'} ${name}`
    b.setAttribute('aria-pressed', String(on))
    b.className = 'rounded-full border px-3 py-1 text-sm transition ' +
      (on ? 'border-aurora bg-aurora/15 text-aurora' : 'border-moon/30 hover:border-aurora')
    b.addEventListener('click', () => toggleConstellation(name))
    return b
  }))
}

function renderPhotos() {
  if (!photos.length) {
    const p = document.createElement('p')
    p.className = 'col-span-full text-sm text-moon/60'
    p.textContent = 'No photos yet. Upload one of your own sky shots above.'
    photoGrid.replaceChildren(p)
    return
  }
  photoGrid.replaceChildren(...photos.map((ph) => {
    const card = document.createElement('figure')
    card.className = 'overflow-hidden rounded-xl border border-moon/20 bg-moon/5'

    const img = document.createElement('img')
    img.src = ph.image
    img.alt = ph.caption || `${ph.constellation} photo`
    img.className = 'aspect-square w-full object-cover'

    const cap = document.createElement('figcaption')
    cap.className = 'p-3 text-sm'
    const name = document.createElement('p')
    name.className = 'font-medium text-aurora'
    name.textContent = ph.constellation
    const text = document.createElement('p')
    text.className = 'mt-1 text-moon/75'
    text.textContent = ph.caption

    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = 'Delete'
    del.className = 'mt-2 text-xs text-moon/50 underline hover:text-aurora'
    del.addEventListener('click', () => deletePhoto(ph.id))

    cap.append(name, text, del)
    card.append(img, cap)
    return card
  }))
}

// ---------- actions ----------

async function loadProfile() {
  setStatus('Loading your sky log…')
  try {
    const data = await api('/api/profile')
    saved = new Set(data.constellations)
    photos = data.photos
    renderShare(data.shareId)
    setStatus('')
  } catch (err) {
    console.error(err)
    setStatus('Could not load your profile. Is the backend running?')
  }
  renderPicker()
  renderPhotos()
}

async function toggleConstellation(name) {
  const wasSaved = saved.has(name)
  wasSaved ? saved.delete(name) : saved.add(name) // update the UI right away
  renderPicker()
  try {
    await api(wasSaved ? '/api/unsave' : '/api/save', {
      method: 'POST',
      body: JSON.stringify({ constellation_name: name }),
    })
  } catch (err) {
    console.error(err)
    wasSaved ? saved.add(name) : saved.delete(name) // undo if the server failed
    renderPicker()
    setStatus('Could not save that. Try again.')
  }
}

// Shrink the photo in the browser so it's small enough to store
function resizeImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error('Not a readable image'))
    img.src = url
  })
}

photoUpload.addEventListener('click', async () => {
  const file = photoFile.files[0]
  if (!file) return setStatus('Choose a photo first.')
  photoUpload.disabled = true
  setStatus('Uploading…')
  try {
    const image = await resizeImage(file)
    await api('/api/photos', {
      method: 'POST',
      body: JSON.stringify({
        constellation_name: photoSelect.value,
        caption: photoCaption.value.trim(),
        image,
      }),
    })
    photoFile.value = ''
    photoCaption.value = ''
    await loadProfile()
  } catch (err) {
    console.error(err)
    setStatus('Upload failed. Try a smaller or different photo.')
  } finally {
    photoUpload.disabled = false
  }
})

async function deletePhoto(id) {
  try {
    await api(`/api/photos/${id}`, { method: 'DELETE' })
    photos = photos.filter((p) => p.id !== id)
    renderPhotos()
  } catch (err) {
    console.error(err)
    setStatus('Could not delete that photo.')
  }
}

// ---------- avatar + dialog wiring ----------

photoSelect.replaceChildren(...CONSTELLATIONS.map((n) => new Option(n, n)))

onUser((user) => {
  if (user?.photoURL) {
    avatarImg.src = user.photoURL
    avatarImg.classList.remove('hidden')
    avatarIcon.classList.add('hidden')
  } else {
    avatarImg.classList.add('hidden')
    avatarIcon.classList.remove('hidden')
  }
  if (user) loadProfile()
  else { saved = new Set(); photos = []; renderPicker(); renderPhotos() }
})

avatarBtn.addEventListener('click', async () => {
  try {
    if (!auth.currentUser) await signIn()
    dlg.showModal()
  } catch (err) {
    console.error(err) // popup closed or blocked
  }
})

document.getElementById('profile-close').addEventListener('click', () => dlg.close())
document.getElementById('profile-signout').addEventListener('click', async () => {
  await logOut()
  dlg.close()
  renderShare(null)
})
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close() })

renderPicker()
renderPhotos()