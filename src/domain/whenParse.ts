/**
 * Dia e hora em português comum (ADR-0014). Quem decide a data é este código, nunca a IA: modelos pequenos erram
 * datas relativas. Devolve null quando o texto não fala de um dia certo (aí segue como pensamento).
 *
 * Entende: hoje, amanhã, depois de amanhã, dias da semana ("sexta", "na quinta que vem"), "dia 28", "28/11",
 * "28/11/2026"; horas "18h", "18h30", "18:30", "às 9", "às 3 da tarde", "meio-dia"; faixas "das 14h às 16h".
 */
import { addDays, parseDateKey, toDateKey } from './dates'
import type { DateKey, TimeKey } from './types'

export interface ParsedWhen {
  date: DateKey
  start: TimeKey | null
  end: TimeKey | null
  /** Trechos do texto que falavam de dia e hora (para tirar do título) */
  spans: [number, number][]
}

const WEEKDAYS: [RegExp, number][] = [
  [/domingo/, 0], [/segunda(?:-feira| feira)?/, 1], [/terca(?:-feira| feira)?/, 2], [/quarta(?:-feira| feira)?/, 3],
  [/quinta(?:-feira| feira)?/, 4], [/sexta(?:-feira| feira)?/, 5], [/sabado/, 6],
]

/** Minúsculas e sem acento, com o mesmo tamanho do texto original (as posições continuam valendo). */
function fold(text: string): string {
  return [...text].map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ch).join('')
}

const pad = (n: number) => String(n).padStart(2, '0')
const time = (h: number, m: number): TimeKey | null => (h >= 0 && h <= 23 && m >= 0 && m <= 59 ? (`${pad(h)}:${pad(m)}` as TimeKey) : null)
const plusHour = (t: TimeKey): TimeKey | null => {
  const [h, m] = t.split(':').map(Number) as [number, number]
  return h >= 23 ? null : time(h + 1, m)
}
const validDate = (y: number, m: number, d: number): DateKey | null => {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? toDateKey(dt) : null
}

function findDate(t: string, today: DateKey): { date: DateKey; span: [number, number] } | null {
  const todayDate = parseDateKey(today)
  let m: RegExpExecArray | null
  if ((m = /\bdepois de amanha\b/.exec(t))) return { date: addDays(today, 2), span: [m.index, m.index + m[0].length] }
  if ((m = /\bamanha\b/.exec(t))) return { date: addDays(today, 1), span: [m.index, m.index + m[0].length] }
  if ((m = /\bhoje\b/.exec(t))) return { date: today, span: [m.index, m.index + m[0].length] }
  // 28/11 ou 28/11/2026 (sem ano: a próxima vez que esse dia acontece)
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
    const d = Number(m[1]), mo = Number(m[2])
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : todayDate.getFullYear()
    let date = validDate(y, mo, d)
    if (date && !m[3] && date < today) date = validDate(y + 1, mo, d)
    if (date) return { date, span: [m.index, m.index + m[0].length] }
  }
  // dia 28 (deste mês; se já passou, do próximo)
  if ((m = /\bdia (\d{1,2})\b/.exec(t))) {
    const d = Number(m[1])
    let y = todayDate.getFullYear(), mo = todayDate.getMonth() + 1
    let date = validDate(y, mo, d)
    if (!date || date < today) {
      mo += 1
      if (mo > 12) { mo = 1; y += 1 }
      date = validDate(y, mo, d)
    }
    if (date) return { date, span: [m.index, m.index + m[0].length] }
  }
  // dia da semana: a próxima vez que ele acontece (o mesmo dia de hoje vira a semana que vem)
  for (const [re, wd] of WEEKDAYS) {
    const w = new RegExp(`\\b(?:n[ao] |nest[ae] |ess[ae] |proxim[ao] )?${re.source}(?: que vem)?\\b`).exec(t)
    if (!w) continue
    const diff = (wd - todayDate.getDay() + 7) % 7 || 7
    return { date: addDays(today, diff), span: [w.index, w.index + w[0].length] }
  }
  return null
}

function findTimes(t: string): { start: TimeKey | null; end: TimeKey | null; spans: [number, number][] } {
  const spans: [number, number][] = []
  let m: RegExpExecArray | null
  if ((m = /\b(?:ao |as |a )?meio[- ]dia\b/.exec(t))) {
    spans.push([m.index, m.index + m[0].length])
    return { start: '12:00' as TimeKey, end: null, spans }
  }
  // uma hora: 18h, 18h30, 18:30, "às 18" (com "às" para não confundir com quantidades), com período opcional
  const one = String.raw`(\d{1,2})(?:(?:h|:)(\d{2})?|h)`
  const bare = String.raw`(?:as|a|ate as|ate a) (\d{1,2})(?::(\d{2}))?(?!\s*(?:\/|dias?|horas|min|km|reais|%|\d))`
  const part = String.raw`(?: (?:da|de) (manha|tarde|noite))?`
  const re = new RegExp(String.raw`\b(?:(?:das|de|as|a) )?(?:${one}|${bare})${part}`, 'g')
  const found: { t: TimeKey; span: [number, number] }[] = []
  while ((m = re.exec(t))) {
    let h = Number(m[1] ?? m[3])
    const min = Number(m[2] ?? m[4] ?? 0)
    const period = m[5]
    if ((period === 'tarde' || period === 'noite') && h < 12) h += 12
    const tk = time(h, min)
    if (tk) found.push({ t: tk, span: [m.index, m.index + m[0].length] })
    if (found.length === 2) break
  }
  if (!found.length) return { start: null, end: null, spans }
  for (const f of found) spans.push(f.span)
  const [first, second] = found
  const end = second && second.t > first!.t ? second.t : null
  return { start: first!.t, end, spans }
}

export function parseWhen(text: string, today: DateKey): ParsedWhen | null {
  const t = fold(text)
  const day = findDate(t, today)
  if (!day || day.date < today) return null
  const times = findTimes(t)
  const start = times.start
  const end = start ? times.end ?? plusHour(start) : null
  return { date: day.date, start, end: start && end ? end : null, spans: [day.span, ...times.spans] }
}

const FILLER = /^(?:(?:eu|que|de|da|do|na|no|em|um|uma|tenho|vou|preciso|lembrar|lembra|lembre|marcar|marca|marque|agendar|ter|ir|ao|a|as|o|os|e|pra|para|com)\s+)+/i
const TRAIL = /(?:\s+(?:de|da|do|na|no|em|as|às|a|à|o|e|pra|para|com|ate|até))+$/i

/** Título sem as palavras de dia e hora: "amanhã tenho dentista às 18h" → "Dentista". */
export function titleWithoutWhen(text: string, when: ParsedWhen): string {
  const chars = [...text]
  for (const [a, b] of when.spans) for (let i = a; i < b && i < chars.length; i++) chars[i] = ' '
  const rest = chars.join('').replace(/[,.;!?]+/g, ' ').replace(/\s+/g, ' ').trim().replace(FILLER, '').replace(TRAIL, '').trim()
  if (!rest) return ''
  return (rest.charAt(0).toUpperCase() + rest.slice(1)).slice(0, 80)
}
