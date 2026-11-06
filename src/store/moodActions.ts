import { toDateKey } from '../domain/dates'
import { checkinId, comfortOf, MOOD_LABEL, validateComfort } from '../domain/mood'
import { uuid } from '../domain/seed'
import type { ComfortItem, Mood, MoodCheckin } from '../domain/types'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer

/** Check-in em 1 toque. Tocar de novo no mesmo humor não faz nada; outro humor substitui. */
export function setMood(mood: Mood) {
  const who = viewer()
  const date = toDateKey(new Date())
  const id = checkinId(who, date)
  const prev = dataStore.get().moodCheckins[id]
  if (prev?.mood === mood) return
  const next: MoodCheckin = { id, ownerId: who, date, mood, note: prev?.note ?? '', updatedAt: nowIso() }
  const undo = transact((tx) => tx.put('moodCheckins', next))
  ui.toast(`Check-in: ${MOOD_LABEL[mood].toLowerCase()}`, { undo, tone: 'info' })
}

export function setMoodNote(note: string) {
  const who = viewer()
  const id = checkinId(who, toDateKey(new Date()))
  const prev = dataStore.get().moodCheckins[id]
  const text = note.trim().slice(0, 120)
  if (!prev || prev.note === text) return
  transact((tx) => tx.put('moodCheckins', { ...prev, note: text, updatedAt: nowIso() }))
  ui.toast('Recado salvo', { tone: 'info' })
}

/** Devolve o erro (para o campo) ou undefined quando entrou na lista */
export function addComfort(text: string): string | undefined {
  const who = viewer()
  const mine = comfortOf(Object.values(dataStore.get().comfortItems), who)
  const error = validateComfort(text, mine)
  if (error) return error
  const iso = nowIso()
  const item: ComfortItem = { id: uuid(), ownerId: who, text: text.trim().slice(0, 120), createdAt: iso, updatedAt: iso }
  transact((tx) => tx.put('comfortItems', item))
  return undefined
}

export function removeComfort(id: string) {
  const prev = dataStore.get().comfortItems[id]
  if (!prev || prev.ownerId !== viewer()) return
  const undo = transact((tx) => tx.remove('comfortItems', id))
  ui.toast('Item tirado da lista', { undo })
}
