import { cycleToday, logsOf, partnerCycleView, upcomingPeriods } from './cycle'
import { addDays } from './dates'
import { firstName } from './format'
import { describeUpcoming } from './specialDates'
import type { CycleLog, CycleSettings, DateKey, PartnerId, SpecialDate } from './types'

/**
 * Agenda única: além de compromissos, tarefas, remédios e contas, os dias mostram as datas especiais e o
 * ciclo. O ciclo do par passa por partnerCycleView (privacidade da dona): "Só o aviso" mostra só a semana
 * de mais cuidado; "Tudo", também a menstruação prevista; "Só eu vejo", nada.
 */

export type MarkKind = 'SPECIAL' | 'PERIOD' | 'CARE'
export type MarkOwner = 'me' | 'partner' | 'us'

export interface DayMark {
  date: DateKey
  kind: MarkKind
  owner: MarkOwner
  label: string
}

export interface AgendaMarkInput {
  viewer: PartnerId
  partnerId: PartnerId
  names: Record<PartnerId, string>
  specialDates: SpecialDate[]
  cycleLogs: CycleLog[]
  cycleSettings: Record<string, CycleSettings>
  today: DateKey
}


function eachDay(from: DateKey, to: DateKey, fn: (d: DateKey) => void) {
  for (let d = from; d <= to; d = addDays(d, 1)) fn(d)
}

/** Marcas dos dias entre from e to (inclusive), sem repetir o mesmo tipo no mesmo dia para a mesma pessoa */
export function agendaMarks(i: AgendaMarkInput, from: DateKey, to: DateKey): DayMark[] {
  const out: DayMark[] = []
  const seen = new Set<string>()
  const push = (m: DayMark) => {
    const key = `${m.date}|${m.kind}|${m.owner}`
    if (m.date < from || m.date > to || seen.has(key)) return
    seen.add(key)
    out.push(m)
  }

  // datas especiais: todo ano, contando os anos
  const y0 = Number(from.slice(0, 4))
  const y1 = Number(to.slice(0, 4))
  for (const sd of i.specialDates) {
    const [, m, d] = sd.date.split('-').map(Number)
    for (let y = y0; y <= y1; y++) {
      const last = new Date(y, m!, 0).getDate()
      const on = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d!, last)).padStart(2, '0')}`
      const years = y - Number(sd.date.slice(0, 4))
      const person = sd.personId ? (sd.personId === i.viewer ? 'você' : firstName(i.names[sd.personId])) : undefined
      push({ date: on, kind: 'SPECIAL', owner: 'us', label: describeUpcoming({ item: sd, on, inDays: 0, years: years > 0 ? years : null }, person) })
    }
  }

  // meu ciclo: menstruação (atual e prevista) e semanas de mais cuidado
  const mySettings = i.cycleSettings[i.viewer]
  if (mySettings) {
    const mine = logsOf(i.cycleLogs, i.viewer)
    addCycle(mine, mySettings, 'me', 'Menstruação', 'Menstruação prevista', 'Semana de mais cuidado')
  }

  // ciclo do par: só o que a dona liberou
  const view = partnerCycleView(i.cycleLogs, i.cycleSettings, i.partnerId, i.viewer, i.today)
  const pname = firstName(i.names[i.partnerId])
  if (view.status === 'gentle') {
    eachDay(view.from, view.to, (d) => push({ date: d, kind: 'CARE', owner: 'partner', label: `Semana de mais cuidado de ${pname}` }))
  } else if (view.status === 'full') {
    const s = i.cycleSettings[i.partnerId]!
    addCycle(logsOf(i.cycleLogs, i.partnerId), s, 'partner', `Menstruação de ${pname}`, `Menstruação prevista de ${pname}`, `Semana de mais cuidado de ${pname}`)
  }

  function addCycle(logs: CycleLog[], s: CycleSettings, owner: MarkOwner, periodLabel: string, predictedLabel: string, careLabel: string) {
    const now = cycleToday(logs, s, i.today)
    if (!now) return
    if (now.inPeriod) {
      const end = now.current.endDate ?? addDays(now.current.startDate, now.stats.periodDays - 1)
      eachDay(now.current.startDate, end, (d) => push({ date: d, kind: 'PERIOD', owner, label: periodLabel }))
    }
    eachDay(now.sensitiveFrom, now.daysUntilNext < 0 ? i.today : now.sensitiveTo, (d) => push({ date: d, kind: 'CARE', owner, label: careLabel }))
    for (const p of upcomingPeriods(logs, s, i.today, 3)) {
      eachDay(p.start, p.end, (d) => push({ date: d, kind: 'PERIOD', owner, label: predictedLabel }))
      eachDay(addDays(p.start, -7), addDays(p.start, -1), (d) => push({ date: d, kind: 'CARE', owner, label: careLabel }))
    }
  }

  const order: Record<MarkKind, number> = { SPECIAL: 0, PERIOD: 1, CARE: 2 }
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind])
}

/** Filtro de pessoa da Agenda aplicado às marcas */
export function marksForScope(marks: DayMark[], scope: 'ALL' | 'MINE' | 'PARTNER' | 'US'): DayMark[] {
  if (scope === 'ALL') return marks
  const want: MarkOwner = scope === 'MINE' ? 'me' : scope === 'PARTNER' ? 'partner' : 'us'
  return marks.filter((m) => m.owner === want)
}
