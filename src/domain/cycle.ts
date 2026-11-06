import { addDays, parseDateKey } from './dates'
import type { CycleLog, CycleSettings, CycleShare, DateKey, PartnerId } from './types'

/**
 * Ciclo menstrual: previsão simples por histórico (mediana dos últimos ciclos), sem promessa médica.
 * TDAH e ciclo: na fase pré-menstrual a queda de estrogênio costuma derrubar foco e humor; o app
 * só sugere pegar mais leve (nunca muda nada sozinho).
 */

export const DEFAULT_CYCLE_DAYS = 28
export const DEFAULT_PERIOD_DAYS = 5
export const CYCLE_DAYS_RANGE = { min: 20, max: 45 } as const
export const PERIOD_DAYS_RANGE = { min: 2, max: 10 } as const
/** Dias antes da menstruação que contam como "semana de mais cuidado" */
export const SENSITIVE_DAYS = 7
/** Quantos ciclos recentes entram na média */
const HISTORY = 6

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATION' | 'LUTEAL' | 'PREMENSTRUAL' | 'LATE'

export const PHASE_LABEL: Record<CyclePhase, string> = {
  MENSTRUAL: 'Menstruação',
  FOLLICULAR: 'Fase folicular',
  OVULATION: 'Janela fértil',
  LUTEAL: 'Fase lútea',
  PREMENSTRUAL: 'Pré-menstrual',
  LATE: 'Menstruação atrasada',
}

/** O que costuma acontecer em cada fase, em linguagem de casal (não é orientação médica) */
export const PHASE_HINT: Record<CyclePhase, string> = {
  MENSTRUAL: 'Energia mais baixa e cólica são comuns. Bolsa de água quente e menos cobrança ajudam.',
  FOLLICULAR: 'Costuma ser a fase com mais energia e foco. Bom momento para tarefas que pedem cabeça.',
  OVULATION: 'Energia e disposição em alta para muita gente.',
  LUTEAL: 'A energia começa a cair aos poucos. Vale planejar a semana com folga.',
  PREMENSTRUAL: 'Foco e paciência costumam cair, e o remédio de TDAH pode parecer mais fraco. Pegue leve.',
  LATE: 'A menstruação passou da data prevista. Ciclos variam; se te preocupar, fale com sua médica.',
}

export const SHARE_LABEL: Record<CycleShare, string> = {
  NONE: 'Só eu vejo',
  GENTLE: 'Só o aviso',
  FULL: 'Tudo',
}

export function defaultCycleSettings(owner: PartnerId, nowIso: string): CycleSettings {
  return {
    id: owner,
    share: 'NONE',
    cycleDays: DEFAULT_CYCLE_DAYS,
    periodDays: DEFAULT_PERIOD_DAYS,
    suggestCalm: true,
    sensitiveFrom: null,
    sensitiveTo: null,
    updatedAt: nowIso,
  }
}

/** Dias de a até b (b - a). Mesmo dia = 0. */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000)
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

/** Registros de uma pessoa, do mais recente para o mais antigo */
export function logsOf(all: CycleLog[], owner: PartnerId): CycleLog[] {
  return all.filter((l) => l.ownerId === owner).sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export interface CycleStats {
  cycleDays: number
  periodDays: number
  /** quantos intervalos reais entraram na média (0 = usando a duração típica dos ajustes) */
  basedOn: number
}

/** Duração do ciclo e da menstruação: mediana do histórico; sem histórico, o que a pessoa informou */
export function cycleStats(logs: CycleLog[], settings: Pick<CycleSettings, 'cycleDays' | 'periodDays'>): CycleStats {
  const sorted = [...logs].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, HISTORY + 1)
  const gaps: number[] = []
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = daysBetween(sorted[i + 1]!.startDate, sorted[i]!.startDate)
    // intervalo fora da faixa = registro esquecido no meio; não entra na média
    if (gap >= CYCLE_DAYS_RANGE.min && gap <= CYCLE_DAYS_RANGE.max) gaps.push(gap)
  }
  const lengths = sorted
    .filter((l) => l.endDate)
    .map((l) => daysBetween(l.startDate, l.endDate!) + 1)
    .filter((n) => n >= 1 && n <= PERIOD_DAYS_RANGE.max)
  return {
    cycleDays: gaps.length ? median(gaps) : settings.cycleDays,
    periodDays: lengths.length ? median(lengths) : settings.periodDays,
    basedOn: gaps.length,
  }
}

export interface CycleToday {
  /** dia do ciclo (1 = primeiro dia da menstruação) */
  day: number
  phase: CyclePhase
  inPeriod: boolean
  /** previsão da próxima menstruação */
  nextStart: DateKey
  /** dias até a próxima (negativo = atrasada) */
  daysUntilNext: number
  /** semana de mais cuidado deste ciclo */
  sensitiveFrom: DateKey
  sensitiveTo: DateKey
  current: CycleLog
  stats: CycleStats
}

/** Onde a pessoa está no ciclo hoje. null = sem registro (ou o último é de muito tempo atrás). */
export function cycleToday(logs: CycleLog[], settings: Pick<CycleSettings, 'cycleDays' | 'periodDays'>, today: DateKey): CycleToday | null {
  const sorted = [...logs].filter((l) => l.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const current = sorted[0]
  if (!current) return null
  const stats = cycleStats(sorted, settings)
  const day = daysBetween(current.startDate, today) + 1
  // mais de 2 ciclos sem registro: a previsão já não diz nada
  if (day > stats.cycleDays * 2 + 7) return null
  const nextStart = addDays(current.startDate, stats.cycleDays)
  const periodEnd = current.endDate ?? addDays(current.startDate, stats.periodDays - 1)
  const inPeriod = today <= periodEnd
  const ovulationDay = Math.max(stats.cycleDays - 14, stats.periodDays + 2)
  const sensitiveFrom = addDays(nextStart, -SENSITIVE_DAYS)
  const sensitiveTo = addDays(nextStart, -1)
  let phase: CyclePhase
  if (inPeriod) phase = 'MENSTRUAL'
  else if (today > nextStart) phase = 'LATE'
  else if (today >= sensitiveFrom) phase = 'PREMENSTRUAL'
  else if (day >= ovulationDay - 2 && day <= ovulationDay + 1) phase = 'OVULATION'
  else if (day < ovulationDay - 2) phase = 'FOLLICULAR'
  else phase = 'LUTEAL'
  return { day, phase, inPeriod, nextStart, daysUntilNext: daysBetween(today, nextStart), sensitiveFrom, sensitiveTo, current, stats }
}

/** Próximas menstruações previstas (para a lista e o calendário). Sempre tracejadas: são previsão. */
export function upcomingPeriods(logs: CycleLog[], settings: Pick<CycleSettings, 'cycleDays' | 'periodDays'>, today: DateKey, count = 3): { start: DateKey; end: DateKey }[] {
  const now = cycleToday(logs, settings, today)
  if (!now) return []
  const { cycleDays, periodDays } = now.stats
  // atrasada: a próxima prevista continua sendo "a qualquer momento", a partir de hoje
  let start = now.daysUntilNext < 0 ? today : now.nextStart
  const out: { start: DateKey; end: DateKey }[] = []
  for (let i = 0; i < count; i++) {
    out.push({ start, end: addDays(start, periodDays - 1) })
    start = addDays(start, cycleDays)
  }
  return out
}

/**
 * Previsão que a dona publica para o par. Com "Só eu vejo" nada sai.
 * Atrasada: a semana de cuidado se estende até hoje (o par segue avisado até ela registrar).
 */
export function publishedForecast(
  logs: CycleLog[],
  settings: Pick<CycleSettings, 'cycleDays' | 'periodDays' | 'share'>,
  today: DateKey,
): { sensitiveFrom: DateKey | null; sensitiveTo: DateKey | null } {
  const now = settings.share === 'NONE' ? null : cycleToday(logs, settings, today)
  if (!now) return { sensitiveFrom: null, sensitiveTo: null }
  // já passou da semana deste ciclo e veio a menstruação: publica a do próximo ciclo
  return { sensitiveFrom: now.sensitiveFrom, sensitiveTo: now.daysUntilNext < 0 ? today : now.sensitiveTo }
}

/* ---------- privacidade (espelho do RLS de cycle_settings e cycle_logs) ---------- */

/** Ajustes do ciclo: da própria pessoa, ou do par quando ele(a) compartilha algo */
export function canViewCycleSettings(s: Pick<CycleSettings, 'id' | 'share'>, viewer: PartnerId): boolean {
  return s.id === viewer || s.share !== 'NONE'
}

/** Registros (datas da menstruação): da própria pessoa, ou do par só com "Tudo" */
export function canViewCycleLog(log: Pick<CycleLog, 'ownerId'>, viewer: PartnerId, ownerSettings: Pick<CycleSettings, 'share'> | undefined): boolean {
  return log.ownerId === viewer || ownerSettings?.share === 'FULL'
}

export type PartnerCycleView =
  | { status: 'hidden' }
  /** GENTLE: só a semana de mais cuidado (sem datas da menstruação) */
  | { status: 'gentle'; from: DateKey; to: DateKey; active: boolean; startsIn: number }
  /** FULL: o ciclo inteiro, como a dona vê */
  | { status: 'full'; cycle: CycleToday; active: boolean; startsIn: number }

/**
 * O que quem está usando vê do ciclo do par. Toda leitura do ciclo de outra pessoa passa por aqui
 * (no aparelho compartilhado os dados existem, mas a tela só mostra o que a dona liberou).
 */
export function partnerCycleView(
  allLogs: CycleLog[],
  allSettings: Record<string, CycleSettings>,
  owner: PartnerId,
  viewer: PartnerId,
  today: DateKey,
): PartnerCycleView {
  const s = allSettings[owner]
  if (!s || owner === viewer || !canViewCycleSettings(s, viewer)) return { status: 'hidden' }
  if (s.share === 'FULL') {
    const visible = allLogs.filter((l) => l.ownerId === owner && canViewCycleLog(l, viewer, s))
    const cycle = cycleToday(visible, s, today)
    if (cycle) {
      const to = cycle.daysUntilNext < 0 ? today : cycle.sensitiveTo
      return { status: 'full', cycle, active: today >= cycle.sensitiveFrom && today <= to, startsIn: daysBetween(today, cycle.sensitiveFrom) }
    }
  }
  if (!s.sensitiveFrom || !s.sensitiveTo || s.sensitiveTo < today) return { status: 'hidden' }
  return {
    status: 'gentle',
    from: s.sensitiveFrom,
    to: s.sensitiveTo,
    active: today >= s.sensitiveFrom,
    startsIn: daysBetween(today, s.sensitiveFrom),
  }
}

/** Mostra o aviso ao par só perto da semana (até 2 dias antes) ou durante */
export const shouldWarnPartner = (v: PartnerCycleView) => v.status !== 'hidden' && (v.active || (v.startsIn >= 0 && v.startsIn <= 2))

/* ---------- registro ---------- */

export interface PeriodInput {
  startDate: DateKey
  endDate: DateKey | null
}

/** Valida um registro de menstruação contra o histórico da própria pessoa */
export function validatePeriod(i: PeriodInput, others: CycleLog[], today: DateKey): Partial<Record<'startDate' | 'endDate', string>> {
  const e: Partial<Record<'startDate' | 'endDate', string>> = {}
  if (i.startDate > today) e.startDate = 'O início não pode ser no futuro.'
  else if (daysBetween(i.startDate, today) > 400) e.startDate = 'Data muito antiga. Registre só o último ano.'
  else {
    const clash = others.find((o) => Math.abs(daysBetween(o.startDate, i.startDate)) < CYCLE_DAYS_RANGE.min - 5)
    if (clash) e.startDate = `Já existe uma menstruação registrada perto desta data (${clash.startDate.slice(8, 10)}/${clash.startDate.slice(5, 7)}).`
  }
  if (i.endDate) {
    if (i.endDate < i.startDate) e.endDate = 'O fim precisa ser no mesmo dia do início ou depois.'
    else if (i.endDate > today) e.endDate = 'O fim não pode ser no futuro.'
    else if (daysBetween(i.startDate, i.endDate) + 1 > PERIOD_DAYS_RANGE.max + 4) e.endDate = 'Mais de 14 dias. Confira as datas.'
  }
  return e
}

/** Duração digitada (dias): inteiro dentro da faixa */
export function parseDays(raw: string, range: { min: number; max: number }): number | null {
  const t = raw.trim()
  if (!/^\d{1,2}$/.test(t)) return null
  const n = Number(t)
  return n >= range.min && n <= range.max ? n : null
}
