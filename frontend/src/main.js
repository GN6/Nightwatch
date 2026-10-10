import '../style.css'

// NASA's skywatching page. Some NASA pages refuse to be embedded in an
// iframe; if yours does, the "Open on NASA.gov" link in the dialog still works.
const NASA_URL = 'https://science.nasa.gov/skywatching/'

const dialog = document.getElementById('events-dialog')
const frame = document.getElementById('events-frame')
const external = document.getElementById('events-external')

external.href = NASA_URL

document.getElementById('events-open').addEventListener('click', () => {
  if (!frame.src) frame.src = NASA_URL // load only when first opened
  dialog.showModal()
})

document.getElementById('events-close').addEventListener('click', () => dialog.close())

// Clicking the dimmed backdrop closes the dialog
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})