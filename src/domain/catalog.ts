import type { CalendarEvent, DateKey, EventKind, Medication, PartnerId, TimeKey } from './types'
import { otherPartner } from './types'
import { PACK_KINDS, packKindOf, validatePackStart, type PackKind } from './pillPack'

/**
 * Cadastros feitos pelo app: remédio, rotina da casa e compromisso.
 * Funções puras (validação + montagem da entidade); as actions só gravam e mostram o Toast.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export const isTimeKey = (v: string): v is TimeKey => TIME_RE.test(v)
export const isDateKey = (v: string): v is DateKey => DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime())

/** Estoque digitado: vazio = sem controle; inteiro >= 0; senão inválido */
export function parseStock(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (!/^\d{1,4}$/.test(t)) return { ok: false }
  return { ok: true, value: Number(t) }
}

type Errors<K extends string> = Partial<Record<K, string>>

/* ---------- Remédio ---------- */

export const MAX_TIMES = 4

/** Horários de um remédio/rotina: 1 a 4, todos HH:MM e sem repetir */
export function validateTimes(times: string[]): string | undefined {
  if (times.length === 0) return 'Informe pelo menos um horário.'
  if (times.length > MAX_TIMES) return `No máximo ${MAX_TIMES} horários por dia.`
  if (times.some((t) => !isTimeKey(t))) return 'Informe cada horário no formato HH:MM.'
  if (new Set(times).size !== times.length) return 'Há dois horários iguais.'
  return undefined
}

const sortTimes = (times: string[]) => [...times].sort()

export interface MedicationInput {
  name: string
  dosage: string
  times: string[]
  stock: string
  shareWithPartner: boolean
  /** anticoncepcional em cartela: tipo e 1º comprimido da cartela atual */
  packKind?: PackKind | 'NONE'
  packStart?: string
}

export function validateMedication(i: MedicationInput, today?: DateKey): Errors<'name' | 'dosage' | 'times' | 'stock' | 'packStart'> {
  const e: Errors<'name' | 'dosage' | 'times' | 'stock' | 'packStart'> = {}
  if (!i.name.trim()) e.name = 'Escreva o nome do remédio (ex.: Venvanse 30mg).'
  if (!i.dosage.trim()) e.dosage = 'Escreva a dose (ex.: 1 cápsula).'
  const times = validateTimes(i.times)
  if (times) e.times = times
  else if (i.packKind && i.packKind !== 'NONE' && i.times.length > 1) e.times = 'Cartela tem um comprimido por dia: deixe um horário só.'
  if (!parseStock(i.stock).ok) e.stock = 'Estoque é um número inteiro, 0 ou mais (ou deixe vazio).'
  if (i.packKind && i.packKind !== 'NONE' && today) {
    const pack = validatePackStart(i.packStart ?? '', today, isDateKey)
    if (pack) e.packStart = pack
  }
  return e
}

/** Monta o remédio novo ou, com `prev`, aplica a edição preservando o que o formulário não mostra */
export function buildMedication(i: MedicationInput, owner: PartnerId, id: string, nowIso: string, prev?: Medication): Medication {
  const stock = parseStock(i.stock)
  return {
    weekdays: [],
    stockUnit: null,
    assignee: null,
    lowStockThreshold: 5,
    delayMinutesThreshold: 30,
    ...prev,
    id: prev?.id ?? id,
    kind: 'MED',
    ownerId: prev?.ownerId ?? owner,
    name: i.name.trim().slice(0, 60),
    dosage: i.dosage.trim().slice(0, 60),
    times: sortTimes(i.times),
    stockCount: stock.ok ? stock.value : null,
    notifyPartnerOnDelay: i.shareWithPartner,
    pack:
      !i.packKind || i.packKind === 'NONE'
        ? null
        : { activeDays: PACK_KINDS[i.packKind].activeDays, pauseDays: PACK_KINDS[i.packKind].pauseDays, startDate: i.packStart ?? '' },
    updatedAt: nowIso,
  }
}

export function medicationToInput(m: Medication): MedicationInput {
  return {
    name: m.name,
    dosage: m.dosage,
    times: [...m.times],
    stock: m.stockCount === null ? '' : String(m.stockCount),
    shareWithPartner: m.notifyPartnerOnDelay,
    packKind: m.pack ? (packKindOf(m.pack) ?? '21_7') : 'NONE',
    packStart: m.pack?.startDate ?? '',
  }
}

/* ---------- Rotina da casa ---------- */

export type RoutineResponsible = 'ANY' | 'ME' | 'PARTNER'

export interface RoutineInput {
  title: string
  times: string[]
  /** 0 = domingo. Vazio = todo dia */
  weekdays: number[]
  instruction: string
  responsible: RoutineResponsible
  stock: string
  stockUnit: string
}

export function validateRoutine(i: RoutineInput): Errors<'title' | 'times' | 'stock'> {
  const e: Errors<'title' | 'times' | 'stock'> = {}
  if (!i.title.trim()) e.title = 'Dê um nome curto para a rotina (ex.: Tirar o lixo).'
  const times = validateTimes(i.times)
  if (times) e.times = times
  if (!parseStock(i.stock).ok) e.stock = 'Quantidade é um número inteiro, 0 ou mais (ou deixe vazio).'
  return e
}

export function buildRoutine(i: RoutineInput, viewer: PartnerId, id: string, nowIso: string, prev?: Medication): Medication {
  const stock = parseStock(i.stock)
  const stockCount = stock.ok ? stock.value : null
  return {
    lowStockThreshold: 3,
    delayMinutesThreshold: 30,
    ...prev,
    id: prev?.id ?? id,
    kind: 'ROUTINE',
    // rotina da casa: qualquer um confirma, então não tem dono
    ownerId: null,
    notifyPartnerOnDelay: false,
    assignee: i.responsible === 'ANY' ? null : i.responsible === 'ME' ? viewer : otherPartner(viewer),
    name: i.title.trim().slice(0, 60),
    dosage: i.instruction.trim().slice(0, 80) || 'Rotina da casa',
    times: sortTimes(i.times),
    weekdays: [...new Set(i.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b),
    stockCount,
    stockUnit: stockCount !== null ? i.stockUnit.trim().slice(0, 20) || 'unidades' : null,
    updatedAt: nowIso,
  }
}

export function routineToInput(m: Medication, viewer: PartnerId): RoutineInput {
  return {
    title: m.name,
    times: [...m.times],
    weekdays: [...m.weekdays],
    instruction: m.dosage === 'Rotina da casa' ? '' : m.dosage,
    responsible: !m.assignee ? 'ANY' : m.assignee === viewer ? 'ME' : 'PARTNER',
    stock: m.stockCount === null ? '' : String(m.stockCount),
    stockUnit: m.stockUnit ?? 'unidades',
  }
}

/** Preset de dias que corresponde à lista (para abrir a edição no botão certo) */
export function weekdaysPreset(days: number[]): 'EVERY' | 'WEEKDAYS' | 'WEEKEND' | 'CUSTOM' {
  const k = [...days].sort().join(',')
  if (k === '' || k === '0,1,2,3,4,5,6') return 'EVERY'
  if (k === '1,2,3,4,5') return 'WEEKDAYS'
  if (k === '0,6') return 'WEEKEND'
  return 'CUSTOM'
}

/* ---------- Compromisso ---------- */

export type EventOwner = 'ME' | 'US'
export type EventType = 'APPOINTMENT' | 'HEALTH' | 'BILL'

export interface EventInput {
  title: string
  date: string
  start: string
  end: string
  owner: EventOwner
  type: EventType
}

export function validateEvent(i: EventInput): Errors<'title' | 'date' | 'start' | 'end'> {
  const e: Errors<'title' | 'date' | 'start' | 'end'> = {}
  if (!i.title.trim()) e.title = 'Escreva o compromisso (ex.: Consulta médica).'
  if (!isDateKey(i.date)) e.date = 'Escolha uma data válida.'
  if (!isTimeKey(i.start)) e.start = 'Informe o início no formato HH:MM.'
  if (!isTimeKey(i.end)) e.end = 'Informe o término no formato HH:MM.'
  else if (isTimeKey(i.start) && i.end <= i.start) e.end = 'O término precisa ser depois do início.'
  return e
}

export function eventKindOf(type: EventType, owner: EventOwner): EventKind {
  if (type === 'HEALTH') return 'HEALTH'
  if (type === 'BILL') return 'BILL'
  return owner === 'US' ? 'COUPLE' : 'PERSONAL'
}

export function eventToInput(e: CalendarEvent): EventInput {
  return {
    title: e.title,
    date: e.date,
    start: e.start,
    end: e.end,
    owner: e.ownerId === null ? 'US' : 'ME',
    type: e.kind === 'HEALTH' ? 'HEALTH' : e.kind === 'BILL' ? 'BILL' : 'APPOINTMENT',
  }
}

export function buildEvent(i: EventInput, viewer: PartnerId, id: string, nowIso: string, prev?: CalendarEvent): CalendarEvent {
  return {
    id: prev?.id ?? id,
    title: i.title.trim().slice(0, 80),
    date: i.date,
    start: i.start,
    end: i.end,
    kind: eventKindOf(i.type, i.owner),
    ownerId: i.owner === 'US' ? null : viewer,
    updatedAt: nowIso,
  }
}

/** Só conta mensagens de fato (campos limpos pelo formulário ficam como undefined) */
export const hasErrors = (e: object) => Object.values(e).some(Boolean)
