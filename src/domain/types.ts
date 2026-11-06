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

export type EventKind = 'COUPLE' | 'HEALTH' | 'PERSONAL'

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
  lowStockThreshold: number
  notifyPartnerOnDelay: boolean
  delayMinutesThreshold: number
  updatedAt: string
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
}

export type CollectionName = keyof Collections

export interface DataState extends Collections {
  schemaVersion: 1
  outbox: OutboxEntry[]
  lastSyncedAt: string | null
}

export const otherPartner = (id: PartnerId): PartnerId => (id === 'A' ? 'B' : 'A')
