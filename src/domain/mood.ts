import type { ComfortItem, DateKey, Mood, MoodCheckin, PartnerId } from './types'

/** Check-in do dia e "o que me acalma": sinal rápido para o par ler o dia da outra pessoa */

export const MOODS: Mood[] = ['GOOD', 'LOW_ENERGY', 'NEED_CARE', 'NEED_SPACE', 'OVERWHELMED']

export const MOOD_LABEL: Record<Mood, string> = {
  GOOD: 'Bem',
  LOW_ENERGY: 'Sem energia',
  NEED_CARE: 'Preciso de colo',
  NEED_SPACE: 'Quero espaço',
  OVERWHELMED: 'No limite',
}

/** O que o par lê ("Julia hoje: preciso de colo") e uma dica do que fazer */
export const MOOD_PARTNER_HINT: Record<Mood, string> = {
  GOOD: 'Dia tranquilo por aí.',
  LOW_ENERGY: 'Pouca energia hoje. Assumir uma tarefa pequena já ajuda.',
  NEED_CARE: 'Pediu colo. Presença vale mais que solução.',
  NEED_SPACE: 'Pediu espaço. Fique por perto, sem cobrar conversa.',
  OVERWHELMED: 'No limite. Menos pedidos, mais apoio prático.',
}

/** Humores em que o app mostra ao par a lista "o que me acalma" */
export const needsComfort = (m: Mood) => m === 'NEED_CARE' || m === 'OVERWHELMED' || m === 'LOW_ENERGY'

export const checkinId = (owner: PartnerId, date: DateKey) => `${owner}@${date}`

export function checkinOf(all: Record<string, MoodCheckin>, owner: PartnerId, date: DateKey): MoodCheckin | undefined {
  return all[checkinId(owner, date)]
}

export function comfortOf(all: ComfortItem[], owner: PartnerId): ComfortItem[] {
  return all.filter((c) => c.ownerId === owner).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const MAX_COMFORT = 12

/** Texto de um item da lista: 3 a 120 caracteres, sem repetir */
export function validateComfort(text: string, existing: ComfortItem[]): string | undefined {
  const t = text.trim()
  if (t.length < 3) return 'Escreva algo que ajuda (ex.: um chá e silêncio).'
  if (existing.length >= MAX_COMFORT) return `No máximo ${MAX_COMFORT} itens. Tire um para pôr outro.`
  if (existing.some((c) => c.text.trim().toLowerCase() === t.toLowerCase())) return 'Esse já está na lista.'
  return undefined
}
