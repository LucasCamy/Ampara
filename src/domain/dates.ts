import type { DateKey, TimeKey } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function toTimeKey(d: Date): TimeKey {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function minutesOf(time: TimeKey): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Combina data + hora locais em um Date */
export function atTime(date: DateKey, time: TimeKey): Date {
  const d = parseDateKey(date)
  const mins = minutesOf(time)
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d
}

export function monthKey(date: DateKey): string {
  return date.slice(0, 7)
}

export function sameMonth(a: DateKey, b: DateKey): boolean {
  return monthKey(a) === monthKey(b)
}

/** Semana começando no domingo que contém a data */
export function weekDays(key: DateKey): DateKey[] {
  const d = parseDateKey(key)
  const start = addDays(key, -d.getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Grade de 6 semanas do mês (domingo a sábado) */
export function monthGrid(key: DateKey): DateKey[] {
  const d = parseDateKey(key)
  const first = toDateKey(new Date(d.getFullYear(), d.getMonth(), 1))
  const start = addDays(first, -parseDateKey(first).getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAY_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const weekdayShort = (key: DateKey) => WEEKDAY_SHORT[parseDateKey(key).getDay()] ?? ''
export const weekdayLong = (key: DateKey) => WEEKDAY_LONG[parseDateKey(key).getDay()] ?? ''
export const monthName = (key: DateKey) => MONTHS[parseDateKey(key).getMonth()] ?? ''
export const dayOfMonth = (key: DateKey) => parseDateKey(key).getDate()

export function relativeDayLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Hoje'
  if (key === addDays(today, 1)) return 'Amanhã'
  if (key === addDays(today, -1)) return 'Ontem'
  return `${weekdayShort(key)}, ${dayOfMonth(key)}/${pad(parseDateKey(key).getMonth() + 1)}`
}

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** "sexta-feira, 13 de novembro" (rótulo por extenso abaixo do campo de data) */
export function longDateLabel(key: DateKey): string {
  return `${weekdayLong(key)}, ${dayOfMonth(key)} de ${monthName(key)}`
}

/** Soma minutos sem virar o dia: o compromisso termina no mesmo dia (máximo 23:59) */
export function addMinutesToTime(time: TimeKey, minutes: number): TimeKey {
  const total = Math.min(Math.max(minutesOf(time) + minutes, 0), 23 * 60 + 59)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

export type DateShortcut = { value: DateKey; label: string; ariaLabel: string }

/** Atalhos de data: Hoje, Amanhã e o próximo sábado depois de amanhã */
export function dateShortcuts(today: DateKey): DateShortcut[] {
  const tomorrow = addDays(today, 1)
  let sat = addDays(today, 2)
  while (parseDateKey(sat).getDay() !== 6) sat = addDays(sat, 1)
  return [
    { value: today, label: 'Hoje', ariaLabel: `Hoje, ${longDateLabel(today)}` },
    { value: tomorrow, label: 'Amanhã', ariaLabel: `Amanhã, ${longDateLabel(tomorrow)}` },
    { value: sat, label: `Sáb ${dayOfMonth(sat)}/${pad(parseDateKey(sat).getMonth() + 1)}`, ariaLabel: longDateLabel(sat) },
  ]
}

/** Horários sugeridos nas gavetas (chips abaixo do campo) */
export const TIME_SHORTCUTS: TimeKey[] = ['08:00', '12:00', '18:00', '20:00']

/** Durações sugeridas para o término, a partir do início */
export const DURATION_SHORTCUTS = [
  { minutes: 30, label: '+30 min' },
  { minutes: 60, label: '+1 h' },
  { minutes: 120, label: '+2 h' },
] as const
