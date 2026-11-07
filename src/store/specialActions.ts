import { firstName } from '../domain/format'
import { specialDateTitle, type SpecialDateInput } from '../domain/specialDates'
import { uuid } from '../domain/seed'
import type { GiftIdea, GiftStatus, SpecialDate } from '../domain/types'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer
const names = () => {
  const p = dataStore.get().profiles
  // título salvo da data ("Aniversário de Julia"): primeiro nome, como nas telas do dia a dia
  return { A: firstName(p.A?.displayName) || 'A', B: firstName(p.B?.displayName) || 'B' }
}

/* ---------- datas especiais (do casal) ---------- */

export function saveSpecialDate(input: SpecialDateInput, id?: string): boolean {
  const prev = id ? dataStore.get().specialDates[id] : undefined
  if (id && !prev) return false
  const item: SpecialDate = {
    id: prev?.id ?? uuid(),
    title: specialDateTitle(input, names()),
    date: input.date,
    kind: input.kind,
    personId: input.kind === 'BIRTHDAY' ? input.personId : null,
    createdBy: prev?.createdBy ?? viewer(),
    updatedAt: nowIso(),
  }
  const undo = transact((tx) => tx.put('specialDates', item))
  ui.toast(prev ? 'Data atualizada' : `${item.title} salvo`, { undo })
  return true
}

export function deleteSpecialDate(id: string): boolean {
  const prev = dataStore.get().specialDates[id]
  if (!prev) return false
  const undo = transact((tx) => {
    tx.remove('specialDates', id)
    // presentes ligados a esta data continuam, só soltos
    for (const g of Object.values(tx.state().giftIdeas)) {
      if (g.specialDateId === id && g.ownerId === viewer()) tx.put('giftIdeas', { ...g, specialDateId: null, updatedAt: nowIso() })
    }
  })
  ui.toast(`${prev.title} excluído`, { undo })
  return true
}

/* ---------- presentes (só de quem anotou) ---------- */

export interface GiftInput {
  title: string
  note: string
  specialDateId: string | null
}

export function saveGift(input: GiftInput, id?: string): boolean {
  const who = viewer()
  const prev = id ? dataStore.get().giftIdeas[id] : undefined
  if (id && (!prev || prev.ownerId !== who)) return false
  const iso = nowIso()
  const gift: GiftIdea = {
    id: prev?.id ?? uuid(),
    ownerId: who,
    title: input.title.trim().slice(0, 80),
    note: input.note.trim().slice(0, 280),
    specialDateId: input.specialDateId,
    status: prev?.status ?? 'IDEA',
    createdAt: prev?.createdAt ?? iso,
    updatedAt: iso,
  }
  const undo = transact((tx) => tx.put('giftIdeas', gift))
  ui.toast(prev ? 'Ideia atualizada' : 'Ideia guardada · só você vê', { undo })
  return true
}

export function setGiftStatus(id: string, status: GiftStatus) {
  const prev = dataStore.get().giftIdeas[id]
  if (!prev || prev.ownerId !== viewer() || prev.status === status) return
  const undo = transact((tx) => tx.put('giftIdeas', { ...prev, status, updatedAt: nowIso() }))
  ui.toast(status === 'BOUGHT' ? `Comprado: ${prev.title}` : status === 'GIVEN' ? `Entregue: ${prev.title}` : 'Voltou para ideias', { undo })
}

export function deleteGift(id: string): boolean {
  const prev = dataStore.get().giftIdeas[id]
  if (!prev || prev.ownerId !== viewer()) return false
  const undo = transact((tx) => tx.remove('giftIdeas', id))
  ui.toast('Ideia excluída', { undo })
  return true
}
