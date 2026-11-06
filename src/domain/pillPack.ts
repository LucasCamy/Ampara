import { daysBetween } from './cycle'
import { addDays } from './dates'
import type { DateKey, Medication, PillPack } from './types'

/**
 * Anticoncepcional em cartela: N dias de comprimido + pausa, repetindo a partir do 1º comprimido.
 * Sem pausa (contínuo) a cartela só serve para contar e avisar a troca.
 */

export type PackKind = '21_7' | '24_4' | '28_0'

export const PACK_KINDS: Record<PackKind, { activeDays: number; pauseDays: number; label: string; hint: string }> = {
  '21_7': { activeDays: 21, pauseDays: 7, label: '21 + 7 de pausa', hint: 'a mais comum' },
  '24_4': { activeDays: 24, pauseDays: 4, label: '24 + 4 de pausa', hint: 'ou 24 ativos + 4 placebo' },
  '28_0': { activeDays: 28, pauseDays: 0, label: '28 contínua', hint: 'sem pausa' },
}

export const packKindOf = (p: PillPack): PackKind | null =>
  (Object.entries(PACK_KINDS).find(([, v]) => v.activeDays === p.activeDays && v.pauseDays === p.pauseDays)?.[0] as PackKind | undefined) ?? null

export interface PackDay {
  /** 1 = primeiro comprimido da cartela atual */
  day: number
  inPause: boolean
  /** comprimido de hoje (1..activeDays); na pausa, null */
  pill: number | null
  /** 1º comprimido da cartela atual */
  packStart: DateKey
  /** 1º comprimido da próxima cartela */
  nextPackStart: DateKey
  /** dias até a pausa começar (0 = hoje é pausa ou o último comprimido); null sem pausa */
  daysToPause: number | null
  pauseStart: DateKey | null
}

export function packDay(pack: PillPack, date: DateKey): PackDay {
  const total = pack.activeDays + pack.pauseDays
  const since = daysBetween(pack.startDate, date)
  // antes da 1ª cartela: trata como a cartela que começa na data informada
  const offset = ((since % total) + total) % total
  const packStart = addDays(date, -offset)
  const day = offset + 1
  const inPause = day > pack.activeDays
  const pauseStart = pack.pauseDays ? addDays(packStart, pack.activeDays) : null
  return {
    day,
    inPause,
    pill: inPause ? null : day,
    packStart,
    nextPackStart: addDays(packStart, total),
    daysToPause: pauseStart ? Math.max(0, daysBetween(date, pauseStart)) : null,
    pauseStart,
  }
}

/** Remédio com cartela: na pausa não existe dose (nem lembrete, nem atraso, nem aviso ao par) */
export function packAllowsDose(med: Medication, date: DateKey): boolean {
  if (!med.pack) return true
  if (date < med.pack.startDate) return false
  return !packDay(med.pack, date).inPause
}

/** Comprimidos que a caixa ainda tem, em dias de calendário (a pausa estica a duração) */
export function packStockDays(pack: PillPack, pills: number): number {
  const total = pack.activeDays + pack.pauseDays
  return Math.floor((pills / pack.activeDays) * total)
}

/** Validação da cartela no formulário */
export function validatePackStart(start: string, today: DateKey, isDate: (v: string) => boolean): string | undefined {
  if (!isDate(start)) return 'Informe a data do 1º comprimido desta cartela.'
  if (daysBetween(today, start) > 7) return 'No máximo uma semana para frente.'
  if (daysBetween(start, today) > 366) return 'Data muito antiga. Use o 1º comprimido da cartela atual.'
  return undefined
}
