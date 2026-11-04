import { parseSetup } from './model'
import type { StudioState, ViewMode, Overlays } from './model'

export interface Capture {
  id: string
  created: string
  state: StudioState
  image: Blob
  view: ViewMode
  overlays: Overlays
  samples: number
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nihonto-studio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('captures', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(`Cannot open local storage: ${request.error?.message}`))
    request.onblocked = () => reject(new Error('Local storage is blocked by another studio tab. Close it and retry.'))
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', mode)
    const request = action(tx.objectStore('captures'))
    tx.oncomplete = () => { db.close(); resolve(request.result) }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error(`Local storage failed: ${tx.error?.message ?? 'transaction aborted'}`)) }
  })
}

export async function listCaptures(): Promise<Capture[]> {
  const captures = await transaction<Capture[]>('readonly', s => s.getAll())
  return captures.map(c => ({ ...c, state: parseSetup(c.state) })).sort((a, b) => b.created.localeCompare(a.created))
}
export async function saveCapture(capture: Capture) { await transaction('readwrite', s => s.put(capture)) }
export async function deleteCapture(id: string) { await transaction('readwrite', s => s.delete(id)) }

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSetup(state: StudioState) {
  download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'nihonto-setup.json')
}
