import { addDays, parseDateKey, toDateKey } from './dates'
import { defaultCycleSettings, publishedForecast } from './cycle'
import { computeShares } from './finance'
import { COLLECTIONS } from './types'
import type {
  CycleLog,
  CycleSettings,
  Couple,
  Pronoun,
  CalendarEvent,
  DataState,
  DateKey,
  HelpRequest,
  Medication,
  PartnerId,
  SplitRule,
  Task,
  Transaction,
  TxCategory,
} from './types'

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const byId = <T extends { id: string }>(xs: T[]): Record<string, T> => Object.fromEntries(xs.map((x) => [x.id, x]))

/** Dia do mês corrente, limitado ao mês */
function dayInMonth(today: DateKey, offset: number): DateKey {
  const candidate = addDays(today, offset)
  const t = parseDateKey(today)
  const c = parseDateKey(candidate)
  if (c.getMonth() !== t.getMonth()) {
    return offset >= 0 ? toDateKey(new Date(t.getFullYear(), t.getMonth() + 1, 0)) : toDateKey(new Date(t.getFullYear(), t.getMonth(), 1))
  }
  return candidate
}

export function buildSeed(now: Date): DataState {
  const iso = now.toISOString()
  const today = toDateKey(now)
  const ratioABps = 6000

  const task = (p: Partial<Task> & Pick<Task, 'title'>): Task => ({
    id: uuid(),
    createdBy: 'A',
    assignedTo: 'A',
    effort: 'QUICK_5M',
    status: 'PENDING',
    dueDate: today,
    dueTime: null,
    visibleToPartner: true,
    sentBy: null,
    completedAt: null,
    completedBy: null,
    sourceMedicationId: null,
    createdAt: iso,
    updatedAt: iso,
    ...p,
  })

  const tasks: Task[] = [
    task({ title: 'Comprar ração do gato', assignedTo: null, effort: 'QUICK_5M' }),
    task({ title: 'Ligar na imobiliária sobre o reajuste', effort: 'FOCUS', dueTime: '11:00' }),
    task({ title: 'Responder e-mail do RH', effort: 'QUICK_5M' }),
    task({ title: 'Separar roupas para doação', effort: 'FOCUS', visibleToPartner: false }),
    task({ title: 'Marcar dentista', createdBy: 'B', assignedTo: 'B', effort: 'QUICK_5M' }),
    task({ title: 'Revisar orçamento da viagem', createdBy: 'B', assignedTo: 'B', effort: 'FOCUS', visibleToPartner: false }),
    task({ title: 'Organizar documentos do IR', assignedTo: null, effort: 'FOCUS', dueDate: addDays(today, 1) }),
    task({ title: 'Trocar a lâmpada da varanda', assignedTo: null, dueDate: addDays(today, 2) }),
    task({ title: 'Lavar roupa de cama', assignedTo: null, dueDate: addDays(today, -1) }),
    task({ title: 'Pesquisar presente de aniversário da mãe', dueDate: null }),
    task({ title: 'Ver horários de pilates', createdBy: 'B', assignedTo: 'B', dueDate: null }),
  ]

  const ev = (p: Omit<CalendarEvent, 'id' | 'updatedAt'>): CalendarEvent => ({ id: uuid(), updatedAt: iso, ...p })
  const events: CalendarEvent[] = [
    ev({ title: 'Reunião de alinhamento', date: today, start: '10:30', end: '11:15', kind: 'PERSONAL', ownerId: 'A' }),
    ev({ title: 'Jantar com a família', date: today, start: '19:30', end: '21:30', kind: 'COUPLE', ownerId: null }),
    ev({ title: 'Consulta com psiquiatra', date: addDays(today, 2), start: '15:00', end: '16:00', kind: 'HEALTH', ownerId: 'A' }),
    ev({ title: 'Cinema', date: addDays(today, 4), start: '20:00', end: '22:30', kind: 'COUPLE', ownerId: null }),
    ev({ title: 'Exame de rotina', date: addDays(today, 6), start: '08:00', end: '09:00', kind: 'HEALTH', ownerId: 'B' }),
    ev({ title: 'Feira de sábado', date: addDays(today, 9), start: '09:00', end: '10:30', kind: 'COUPLE', ownerId: null }),
  ]

  const med = (p: Omit<Medication, 'id' | 'updatedAt' | 'delayMinutesThreshold' | 'weekdays'> & Partial<Medication>): Medication => ({
    id: uuid(),
    updatedAt: iso,
    delayMinutesThreshold: 30,
    weekdays: [],
    ...p,
  })
  const meds: Medication[] = [
    med({ kind: 'MED', ownerId: 'A', name: 'Venvanse 30mg', dosage: '1 cápsula', times: ['08:00'], stockCount: 12, lowStockThreshold: 5, notifyPartnerOnDelay: true }),
    med({ kind: 'MED', ownerId: 'A', name: 'Vitamina D 2000UI', dosage: '1 gota dupla', times: ['13:00'], stockCount: 28, lowStockThreshold: 5, notifyPartnerOnDelay: false }),
    med({ kind: 'MED', ownerId: 'B', name: 'Anticoncepcional', dosage: '1 comprimido', times: ['21:00'], stockCount: 6, lowStockThreshold: 5, notifyPartnerOnDelay: true }),
    med({ kind: 'MED', ownerId: 'B', name: 'Magnésio', dosage: '1 cápsula', times: ['22:00'], stockCount: 40, lowStockThreshold: 5, notifyPartnerOnDelay: false }),
    med({ kind: 'ROUTINE', ownerId: null, name: 'Remédio do gato', dosage: 'meio comprimido na ração', times: ['19:00'], stockCount: 14, lowStockThreshold: 5, notifyPartnerOnDelay: false }),
    med({ kind: 'ROUTINE', ownerId: null, name: 'Tirar o lixo', dosage: 'orgânico e reciclável', times: ['20:00'], weekdays: [1, 3, 5], stockCount: null, lowStockThreshold: 0, notifyPartnerOnDelay: false }),
  ]

  const tx = (
    p: {
      description: string
      amountCents: number
      paidBy: PartnerId
      scope: Transaction['scope']
      category: TxCategory
      date: DateKey
      status?: Transaction['status']
      rule?: SplitRule
      gift?: boolean
    },
  ): Transaction => {
    const shares =
      p.scope === 'COUPLE'
        ? computeShares(p.amountCents, p.rule ?? '50_50', p.paidBy, ratioABps)
        : p.paidBy === 'A'
          ? { partnerAShareCents: p.amountCents, partnerBShareCents: 0 }
          : { partnerAShareCents: 0, partnerBShareCents: p.amountCents }
    return {
      id: uuid(),
      createdBy: p.paidBy,
      paidBy: p.paidBy,
      scope: p.scope,
      isSecretGift: p.gift ?? false,
      type: 'EXPENSE',
      status: p.status ?? 'CONFIRMED_SOLID',
      amountCents: p.amountCents,
      category: p.category,
      description: p.description,
      splitRule: p.scope === 'COUPLE' ? (p.rule ?? '50_50') : null,
      ...shares,
      competenceDate: p.date,
      updatedAt: iso,
    }
  }

  // Exemplo do doc 05: 150 − 100 + 60 = Ela transfere R$ 110,00 para Lucas
  const transactions: Transaction[] = [
    tx({ description: 'Supermercado', amountCents: 30000, paidBy: 'A', scope: 'COUPLE', category: 'MARKET', date: dayInMonth(today, -6) }),
    tx({ description: 'Conta de energia', amountCents: 20000, paidBy: 'B', scope: 'COUPLE', category: 'HOME', date: dayInMonth(today, -4) }),
    tx({ description: 'Jantar delivery', amountCents: 12000, paidBy: 'A', scope: 'COUPLE', category: 'FOOD', date: dayInMonth(today, -2) }),
    tx({ description: 'Internet', amountCents: 12000, paidBy: 'A', scope: 'COUPLE', category: 'HOME', date: dayInMonth(today, 3), status: 'PREDICTED_DASHED' }),
    tx({ description: 'Aluguel', amountCents: 240000, paidBy: 'A', scope: 'COUPLE', category: 'HOME', date: dayInMonth(today, 6), status: 'PREDICTED_DASHED', rule: 'PROPORTIONAL' }),
    tx({ description: 'Café com o time', amountCents: 1850, paidBy: 'A', scope: 'PERSONAL', category: 'FOOD', date: dayInMonth(today, -1) }),
    tx({ description: 'Livro de ficção', amountCents: 5990, paidBy: 'A', scope: 'PERSONAL', category: 'LEISURE', date: dayInMonth(today, -3) }),
    tx({ description: 'Academia', amountCents: 9990, paidBy: 'B', scope: 'PERSONAL', category: 'HEALTH', date: dayInMonth(today, -5) }),
    tx({ description: 'Uber para o trabalho', amountCents: 2340, paidBy: 'B', scope: 'PERSONAL', category: 'TRANSPORT', date: dayInMonth(today, -1) }),
  ]

  const dentista = tasks.find((t) => t.title === 'Marcar dentista')
  const helpRequests: HelpRequest[] = [
    {
      id: uuid(),
      requesterId: 'B',
      targetTaskId: dentista?.id ?? null,
      situation: 'Marcar dentista',
      helpType: 'BODY_DOUBLING',
      urgency: 'TODAY',
      status: 'OPEN',
      response: null,
      respondedAt: null,
      createdAt: iso,
      updatedAt: iso,
    },
  ]

  // Ciclo de exemplo da Parceira B: dia 23 de 28 (semana de mais cuidado), compartilhado só como aviso
  const cycleLogs: CycleLog[] = [78, 50, 22].map((ago) => ({
    id: uuid(),
    ownerId: 'B',
    startDate: addDays(today, -ago),
    endDate: addDays(today, -ago + 4),
    updatedAt: iso,
  }))
  const cycleB: CycleSettings = { ...defaultCycleSettings('B', iso), share: 'GENTLE' }
  Object.assign(cycleB, publishedForecast(cycleLogs, cycleB, today))

  return {
    schemaVersion: 1,
    couple: {
      couple: { id: 'couple', inviteCode: '482 913', pairedAt: iso, splitMode: '50_50', ratioABps },
    },
    profiles: {
      A: { id: 'A', displayName: 'Lucas', pronoun: 'ele', energy: 'MEDIUM', energyUpdatedAt: iso, sharePersonalFinances: true, updatedAt: iso },
      B: { id: 'B', displayName: 'Namorada', pronoun: 'ela', energy: 'FULL', energyUpdatedAt: iso, sharePersonalFinances: false, updatedAt: iso },
    },
    tasks: byId(tasks),
    events: byId(events),
    meds: byId(meds),
    medLogs: {},
    transactions: byId(transactions),
    helpRequests: byId(helpRequests),
    nudges: {},
    cycleSettings: { B: cycleB },
    cycleLogs: byId(cycleLogs),
    outbox: [],
    lastSyncedAt: iso,
  }
}

/**
 * Cofre gravado por uma versão anterior do app: coleções novas ainda não existem nele.
 * Completa com coleções vazias (nunca apaga nada do que veio).
 */
export function normalizeState(state: DataState): DataState {
  const missing = COLLECTIONS.filter((c) => !state[c] || typeof state[c] !== 'object')
  if (!missing.length) return state
  return { ...state, ...Object.fromEntries(missing.map((c) => [c, {}])) }
}

export interface CoupleIdentity {
  a: { name: string; pronoun: Pronoun }
  b: { name: string; pronoun: Pronoun }
  inviteCode: string
  splitMode?: Couple['splitMode']
  shareA?: boolean
  shareB?: boolean
}

/** Aplica nomes, pronomes, convite e preferências iniciais a um estado (exemplo ou vazio) */
export function withIdentity(state: DataState, id: CoupleIdentity): DataState {
  const couple = state.couple.couple
  return {
    ...state,
    couple: couple
      ? { couple: { ...couple, inviteCode: id.inviteCode, splitMode: id.splitMode ?? couple.splitMode } }
      : state.couple,
    profiles: {
      A: { ...state.profiles.A!, displayName: id.a.name, pronoun: id.a.pronoun, sharePersonalFinances: id.shareA ?? state.profiles.A!.sharePersonalFinances },
      B: { ...state.profiles.B!, displayName: id.b.name, pronoun: id.b.pronoun, sharePersonalFinances: id.shareB ?? state.profiles.B!.sharePersonalFinances },
    },
  }
}

/** Estado sem lançamentos: casal recém-criado que não quer dados de exemplo */
export function buildEmpty(now: Date): DataState {
  const seed = buildSeed(now)
  return {
    ...seed,
    tasks: {},
    events: {},
    meds: {},
    medLogs: {},
    transactions: {},
    helpRequests: {},
    nudges: {},
    cycleSettings: {},
    cycleLogs: {},
    outbox: [],
  }
}
