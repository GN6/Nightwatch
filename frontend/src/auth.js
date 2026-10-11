import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'firebase/auth'

const app = initializeApp({
  apiKey: 'AIzaSyA6k3acdB7wbKd5k7Wy-ytp2yv63jClAiA',
  authDomain: 'stargazing-67a87.firebaseapp.com',
  projectId: 'stargazing-67a87',
  appId: '1:99547029582:web:a7d86ec50e3dd80f4ea31f',
})

export const auth = getAuth(app)
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider())
export const logOut = () => signOut(auth)
export const onUser = (cb) => onAuthStateChanged(auth, cb)

// Calls our FastAPI backend with the user's Firebase ID token
export async function api(path, options = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const token = await user.getIdToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}