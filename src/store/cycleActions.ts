import { firstName } from '../domain/format'
import { defaultCycleSettings, logsOf, publishedForecast, type PeriodInput } from '../domain/cycle'
import { toDateKey } from '../domain/dates'
import { uuid } from '../domain/seed'
import type { CycleLog, CycleSettings, PartnerId } from '../domain/types'
import { dataStore, transact, type Tx } from './data'
import { ui, uiStore } from './ui'

/**
 * Ciclo menstrual. Só a dona registra e ajusta; quem está usando vem da sessão (uiStore.viewer).
 * A cada mudança a previsão publicada para o par é recalculada (some com "Só eu vejo").
 */

const nowIso = () => new Date().toISOString()
const today = () => toDateKey(new Date())
const me = (): PartnerId => uiStore.get().viewer

function settingsOf(tx: Tx, who: PartnerId): CycleSettings {
  return tx.get('cycleSettings', who) ?? defaultCycleSettings(who, nowIso())
}

/** Grava os ajustes com a previsão recalculada sobre os registros atuais da transação */
function publish(tx: Tx, who: PartnerId, patch: Partial<CycleSettings> = {}) {
  const base = { ...settingsOf(tx, who), ...patch }
  const logs = logsOf(Object.values(tx.state().cycleLogs), who)
  const next: CycleSettings = { ...base, ...publishedForecast(logs, base, today()), id: who }
  const prev = tx.get('cycleSettings', who)
  if (prev && JSON.stringify({ ...prev, updatedAt: '' }) === JSON.stringify({ ...next, updatedAt: '' })) return
  tx.put('cycleSettings', { ...next, updatedAt: nowIso() })
}

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Registra (ou corrige) uma menstruação. A validação mora em domain/cycle (validatePeriod). */
export function savePeriod(input: PeriodInput, id?: string): boolean {
  const who = me()
  const prev = id ? dataStore.get().cycleLogs[id] : undefined
  if (id && (!prev || prev.ownerId !== who)) {
    ui.toast('Este registro não existe mais.', { tone: 'warn' })
    return false
  }
  const log: CycleLog = { id: prev?.id ?? uuid(), ownerId: who, startDate: input.startDate, endDate: input.endDate, updatedAt: nowIso() }
  const undo = transact((tx) => {
    tx.put('cycleLogs', log)
    publish(tx, who)
  })
  ui.toast(prev ? 'Registro atualizado' : `Menstruação registrada desde ${short(input.startDate)}`, { undo })
  return true
}

/** "Terminou hoje": um toque no card do ciclo */
export function endPeriodToday(id: string) {
  const prev = dataStore.get().cycleLogs[id]
  if (!prev || prev.ownerId !== me()) return
  const end = today() < prev.startDate ? prev.startDate : today()
  const undo = transact((tx) => {
    tx.put('cycleLogs', { ...prev, endDate: end, updatedAt: nowIso() })
    publish(tx, prev.ownerId)
  })
  ui.toast('Fim da menstruação registrado', { undo })
}

export function deletePeriod(id: string): boolean {
  const prev = dataStore.get().cycleLogs[id]
  if (!prev || prev.ownerId !== me()) return false
  const undo = transact((tx) => {
    tx.remove('cycleLogs', id)
    publish(tx, prev.ownerId)
  })
  ui.toast('Registro excluído', { undo })
  return true
}

export function updateCycleSettings(patch: Partial<Pick<CycleSettings, 'share' | 'cycleDays' | 'periodDays' | 'suggestCalm'>>) {
  const who = me()
  const undo = transact((tx) => publish(tx, who, patch))
  if (patch.share) {
    const partner = firstName(dataStore.get().profiles[who === 'A' ? 'B' : 'A']?.displayName) || 'Seu par'
    const msg = { NONE: 'Seu ciclo agora é só seu', GENTLE: `${partner} vê só a semana de mais cuidado`, FULL: `${partner} pode ver seu ciclo` }[patch.share]
    ui.toast(msg, { undo, tone: 'info' })
  }
}
