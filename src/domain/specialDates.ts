import { daysBetween } from './cycle'
import { parseDateKey, toDateKey } from './dates'
import type { DateKey, GiftIdea, PartnerId, SpecialDate, SpecialDateKind } from './types'

/** Datas especiais (repetem todo ano) e ideias de presente (privadas de quem anotou) */

export const REMIND_DAYS = 7

export const KIND_LABEL: Record<SpecialDateKind, string> = {
  ANNIVERSARY: 'Aniversário de namoro',
  BIRTHDAY: 'Aniversário',
  OTHER: 'Data especial',
}

/** Próxima vez que a data cai (hoje conta). 29/02 vira 28/02 em ano não bissexto. */
export function nextOccurrence(date: DateKey, today: DateKey): DateKey {
  const [, m, d] = date.split('-').map(Number)
  const t = parseDateKey(today)
  const make = (y: number) => {
    const last = new Date(y, m!, 0).getDate()
    return toDateKey(new Date(y, m! - 1, Math.min(d!, last)))
  }
  const thisYear = make(t.getFullYear())
  return thisYear >= today ? thisYear : make(t.getFullYear() + 1)
}

export interface UpcomingDate {
  item: SpecialDate
  on: DateKey
  inDays: number
  /** quantos anos completa (null se a data original é deste ano ou do futuro) */
  years: number | null
}

export function upcomingDates(all: SpecialDate[], today: DateKey): UpcomingDate[] {
  return all
    .map((item) => {
      const on = nextOccurrence(item.date, today)
      const years = Number(on.slice(0, 4)) - Number(item.date.slice(0, 4))
      return { item, on, inDays: daysBetween(today, on), years: years > 0 ? years : null }
    })
    .sort((a, b) => a.inDays - b.inDays || a.item.title.localeCompare(b.item.title))
}

/** Datas que pedem lembrete no Hoje (até 7 dias antes, inclusive o dia) */
export const datesToRemind = (all: SpecialDate[], today: DateKey) => upcomingDates(all, today).filter((u) => u.inDays <= REMIND_DAYS)

/** "3 anos de namoro", "30 anos da Julia", "Hoje", "em 5 dias" */
export function describeUpcoming(u: UpcomingDate, personName?: string): string {
  if (!u.years) return u.item.title
  if (u.item.kind === 'ANNIVERSARY') return `${u.years} ${u.years === 1 ? 'ano' : 'anos'} de namoro`
  if (u.item.kind === 'BIRTHDAY' && personName) return `${u.years} anos de ${personName}`
  return `${u.item.title} · ${u.years} ${u.years === 1 ? 'ano' : 'anos'}`
}

export const whenLabel = (inDays: number) => (inDays === 0 ? 'hoje' : inDays === 1 ? 'amanhã' : `em ${inDays} dias`)

/* ---------- presentes (privacidade: espelho de gift_ideas_read) ---------- */

/** Ideia de presente é surpresa: só quem anotou lê, em qualquer aparelho */
export const canViewGift = (g: Pick<GiftIdea, 'ownerId'>, viewer: PartnerId) => g.ownerId === viewer

export function giftsFor(all: GiftIdea[], viewer: PartnerId): GiftIdea[] {
  const order = { IDEA: 0, BOUGHT: 1, GIVEN: 2 } as const
  return all.filter((g) => canViewGift(g, viewer)).sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt))
}

export interface SpecialDateInput {
  title: string
  date: string
  kind: SpecialDateKind
  personId: PartnerId | null
}

export function validateSpecialDate(i: SpecialDateInput, today: DateKey, isDate: (v: string) => boolean): Partial<Record<'title' | 'date', string>> {
  const e: Partial<Record<'title' | 'date', string>> = {}
  if (i.kind === 'OTHER' && !i.title.trim()) e.title = 'Dê um nome (ex.: Primeiro encontro).'
  if (!isDate(i.date)) e.date = 'Informe a data.'
  else if (i.date > today && Number(i.date.slice(0, 4)) > Number(today.slice(0, 4)) + 1) e.date = 'Use a data original (o ano em que aconteceu).'
  return e
}

/** Título padrão por tipo: o formulário só pede o nome em "Outra data" */
export function specialDateTitle(i: SpecialDateInput, names: Record<PartnerId, string>): string {
  if (i.title.trim()) return i.title.trim().slice(0, 60)
  if (i.kind === 'ANNIVERSARY') return 'Aniversário de namoro'
  if (i.kind === 'BIRTHDAY' && i.personId) return `Aniversário de ${names[i.personId].split(' ')[0]}`
  return 'Data especial'
}
