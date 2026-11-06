export type PartnerId = 'A' | 'B'
export type Pronoun = 'ele' | 'ela'
export type EnergyLevel = 'FULL' | 'MEDIUM' | 'OVERLOAD'
/** Data local no formato YYYY-MM-DD */
export type DateKey = string
/** Horário local HH:MM */
export type TimeKey = string

export type SplitMode = '50_50' | 'PROPORTIONAL'

export interface Couple {
  id: 'couple'
  /** Identificador do espaço na nuvem (couple_id no Supabase). Só existe após conectar. */
  spaceId?: string
  inviteCode: string
  pairedAt: string
  splitMode: SplitMode
  /** Parte do Parceiro A em pontos-base (6000 = 60%) usada na divisão proporcional */
  ratioABps: number
  updatedAt?: string
}

export interface Profile {
  id: PartnerId
  displayName: string
  pronoun: Pronoun
  energy: EnergyLevel
  energyUpdatedAt: string | null
  sharePersonalFinances: boolean
  updatedAt: string
}

export type TaskEffort = 'QUICK_5M' | 'FOCUS'
export type TaskStatus = 'PENDING' | 'DONE' | 'ARCHIVED'

export interface Task {
  id: string
  createdBy: PartnerId
  /** null = da dupla (Nós) */
  assignedTo: PartnerId | null
  title: string
  effort: TaskEffort
  status: TaskStatus
  /** null = Caixa de Entrada */
  dueDate: DateKey | null
  dueTime: TimeKey | null
  /** Tarefa pessoal visível ao par no painel do dia */
  visibleToPartner: boolean
  /** Quem enviou ao par ("Enviar p/ Amor") */
  sentBy: PartnerId | null
  completedAt: string | null
  completedBy: PartnerId | null
  /** Tarefa sugerida automaticamente (estoque baixo) */
  sourceMedicationId: string | null
  createdAt: string
  updatedAt: string
}

/** COUPLE/PERSONAL = compromisso (do casal / de uma pessoa), HEALTH = saúde/remédio, BILL = conta que vence */
export type EventKind = 'COUPLE' | 'HEALTH' | 'PERSONAL' | 'BILL'

export interface CalendarEvent {
  id: string
  title: string
  date: DateKey
  start: TimeKey
  end: TimeKey
  kind: EventKind
  /** null = do casal */
  ownerId: PartnerId | null
  updatedAt: string
}

export type MedicationKind = 'MED' | 'ROUTINE'

export interface Medication {
  id: string
  kind: MedicationKind
  /** null = rotina da casa, confirmável por qualquer um */
  ownerId: PartnerId | null
  name: string
  dosage: string
  times: TimeKey[]
  /** 0 = domingo. Vazio = todos os dias */
  weekdays: number[]
  stockCount: number | null
  /** Unidade do estoque ("comprimidos", "unidades"). Vazio = padrão pelo tipo */
  stockUnit?: string | null
  /** Rotina da casa: quem costuma fazer (só referência; qualquer um confirma). null = qualquer um */
  assignee?: PartnerId | null
  lowStockThreshold: number
  notifyPartnerOnDelay: boolean
  delayMinutesThreshold: number
  /** Anticoncepcional em cartela (comprimidos + pausa). null/ausente = remédio comum */
  pack?: PillPack | null
  updatedAt: string
}

export interface PillPack {
  activeDays: number
  pauseDays: number
  /** 1º comprimido de uma cartela (as seguintes se repetem a partir dele) */
  startDate: DateKey
}

export type DoseStatus = 'PENDING' | 'SNOOZED_WATER' | 'TAKEN' | 'SKIPPED'
export type SkipReason = 'FORGOT' | 'OUT_OF_STOCK' | 'MEDICAL'

export interface MedicationLog {
  /** `${medicationId}@${date}@${time}` */
  id: string
  medicationId: string
  scheduledDate: DateKey
  scheduledTime: TimeKey
  status: DoseStatus
  takenAt: string | null
  confirmedBy: PartnerId | null
  snoozeCount: number
  snoozeUntil: string | null
  skipReason: SkipReason | null
  updatedAt: string
}

export type TxScope = 'PERSONAL' | 'COUPLE'
export type TxType = 'EXPENSE' | 'INCOME' | 'SETTLEMENT'
export type TxStatus = 'PREDICTED_DASHED' | 'CONFIRMED_SOLID'
export type TxCategory = 'MARKET' | 'FOOD' | 'HOME' | 'HEALTH' | 'TRANSPORT' | 'LEISURE' | 'OTHER'
export type SplitRule = '50_50' | 'PROPORTIONAL' | 'FULL_FOR_PARTNER' | 'CUSTOM'

export interface Transaction {
  id: string
  createdBy: PartnerId
  /** Quem desembolsou. Em SETTLEMENT, quem transferiu. */
  paidBy: PartnerId
  scope: TxScope
  isSecretGift: boolean
  type: TxType
  status: TxStatus
  amountCents: number
  category: TxCategory
  description: string
  splitRule: SplitRule | null
  partnerAShareCents: number
  partnerBShareCents: number
  competenceDate: DateKey
  updatedAt: string
}

export type HelpType = 'TAKE_OVER' | 'BODY_DOUBLING' | 'REMIND_ME'
export type Urgency = 'NOW' | 'TODAY' | 'THIS_WEEK'
export type HelpStatus = 'OPEN' | 'ACCEPTED' | 'RESOLVED'
export type HelpResponse = 'TAKE_OVER' | 'TOGETHER'

export interface HelpRequest {
  id: string
  requesterId: PartnerId
  targetTaskId: string | null
  situation: string
  helpType: HelpType
  urgency: Urgency
  status: HelpStatus
  response: HelpResponse | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Nudge {
  id: string
  from: PartnerId
  to: PartnerId
  medicationLogId: string
  message: string
  createdAt: string
  seenAt: string | null
  updatedAt: string
}

/**
 * Ciclo menstrual (dado de saúde sensível). Só a dona grava.
 * NONE = o par não vê nada; GENTLE = o par vê só a semana de mais cuidado; FULL = o par vê o ciclo.
 */
export type CycleShare = 'NONE' | 'GENTLE' | 'FULL'

export interface CycleLog {
  id: string
  ownerId: PartnerId
  /** primeiro dia da menstruação */
  startDate: DateKey
  /** último dia; null = ainda não marcou o fim (vale a duração típica) */
  endDate: DateKey | null
  updatedAt: string
}

export interface CycleSettings {
  /** = dona (um por pessoa) */
  id: PartnerId
  share: CycleShare
  /** duração típica do ciclo (dias), usada até haver histórico suficiente */
  cycleDays: number
  /** duração típica da menstruação (dias) */
  periodDays: number
  /** sugerir Bateria Mental mais leve na fase pré-menstrual */
  suggestCalm: boolean
  /** previsão publicada para o par (só com GENTLE ou FULL), recalculada pela dona a cada registro */
  sensitiveFrom: DateKey | null
  sensitiveTo: DateKey | null
  updatedAt: string
}

/** Lista de compras do casal (qualquer um adiciona e marca) */
export type ShopCategory = 'MARKET' | 'PHARMACY' | 'HOME' | 'OTHER'

export interface ShoppingItem {
  id: string
  title: string
  /** "2", "1 kg", "3 un" (texto livre curto). null = sem quantidade */
  quantity: string | null
  category: ShopCategory
  addedBy: PartnerId
  /** no carrinho */
  checked: boolean
  checkedBy: PartnerId | null
  /** remédio que gerou o item (estoque baixo) */
  sourceMedicationId: string | null
  createdAt: string
  updatedAt: string
}

/** Datas que se repetem todo ano (do casal: os dois veem) */
export type SpecialDateKind = 'ANNIVERSARY' | 'BIRTHDAY' | 'OTHER'

export interface SpecialDate {
  id: string
  title: string
  /** data original (o ano conta quantos anos faz) */
  date: DateKey
  kind: SpecialDateKind
  /** aniversário de quem (BIRTHDAY); null = do casal */
  personId: PartnerId | null
  createdBy: PartnerId
  updatedAt: string
}

/** Ideia de presente: só quem anotou vê (é surpresa) */
export type GiftStatus = 'IDEA' | 'BOUGHT' | 'GIVEN'

export interface GiftIdea {
  id: string
  ownerId: PartnerId
  title: string
  note: string
  /** data especial ligada (opcional) */
  specialDateId: string | null
  status: GiftStatus
  createdAt: string
  updatedAt: string
}

/** Check-in do dia: como a pessoa está (o par vê) */
export type Mood = 'GOOD' | 'LOW_ENERGY' | 'NEED_CARE' | 'NEED_SPACE' | 'OVERWHELMED'

export interface MoodCheckin {
  /** `${ownerId}@${date}`: um por pessoa por dia (mudar sobrescreve) */
  id: string
  ownerId: PartnerId
  date: DateKey
  mood: Mood
  note: string
  updatedAt: string
}

/** "O que me acalma": escrito por uma pessoa para o par ler nos dias difíceis */
export interface ComfortItem {
  id: string
  ownerId: PartnerId
  text: string
  createdAt: string
  updatedAt: string
}

/** Body doubling: um começa, o outro entra junto (do casal) */
export type FocusStatus = 'RUNNING' | 'DONE' | 'CANCELLED'

export interface FocusSession {
  id: string
  startedBy: PartnerId
  title: string
  /** tarefa ligada (concluir ao terminar) */
  taskId: string | null
  durationMin: number
  startedAt: string
  endsAt: string
  joinedBy: PartnerId | null
  status: FocusStatus
  updatedAt: string
}

/** Caixinha: meta de dinheiro do casal (centavos) */
export interface SavingsGoal {
  id: string
  title: string
  targetCents: number
  savedCents: number
  deadline: DateKey | null
  createdBy: PartnerId
  createdAt: string
  updatedAt: string
}

export type OutboxOperation = 'UPSERT' | 'DELETE'
export type OutboxStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export interface OutboxEntry {
  id: string
  entityType: CollectionName
  entityId: string
  operation: OutboxOperation
  payload: unknown
  /** Hybrid logical clock simplificado: ms epoch + contador */
  hlc: string
  status: OutboxStatus
  attempts: number
}

export interface Collections {
  couple: Record<string, Couple>
  profiles: Record<string, Profile>
  tasks: Record<string, Task>
  events: Record<string, CalendarEvent>
  meds: Record<string, Medication>
  medLogs: Record<string, MedicationLog>
  transactions: Record<string, Transaction>
  helpRequests: Record<string, HelpRequest>
  nudges: Record<string, Nudge>
  cycleSettings: Record<string, CycleSettings>
  cycleLogs: Record<string, CycleLog>
  shoppingItems: Record<string, ShoppingItem>
  specialDates: Record<string, SpecialDate>
  giftIdeas: Record<string, GiftIdea>
  moodCheckins: Record<string, MoodCheckin>
  comfortItems: Record<string, ComfortItem>
  focusSessions: Record<string, FocusSession>
  savingsGoals: Record<string, SavingsGoal>
}

export type CollectionName = keyof Collections

/** Todas as coleções, na ordem de sincronização (casal e perfis primeiro; ajustes antes dos registros) */
export const COLLECTIONS: CollectionName[] = [
  'couple',
  'profiles',
  'tasks',
  'events',
  'meds',
  'medLogs',
  'transactions',
  'helpRequests',
  'nudges',
  'cycleSettings',
  'cycleLogs',
  'shoppingItems',
  'specialDates',
  'giftIdeas',
  'moodCheckins',
  'comfortItems',
  'focusSessions',
  'savingsGoals',
]

export interface DataState extends Collections {
  schemaVersion: 1
  outbox: OutboxEntry[]
  lastSyncedAt: string | null
}

export const otherPartner = (id: PartnerId): PartnerId => (id === 'A' ? 'B' : 'A')
