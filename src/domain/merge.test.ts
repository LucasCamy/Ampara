import { describe, expect, it } from 'vitest'
import { applyRemote, pickWinner, purgeUnauthorized } from './merge'
import { buildSeed } from './seed'
import type { MedicationLog, Task, Transaction } from './types'

const base = buildSeed(new Date('2026-11-06T10:00:00'))
const task = Object.values(base.tasks)[0] as Task
const log = (status: MedicationLog['status'], updatedAt: string): MedicationLog => ({
  id: 'm@2026-11-06@08:00',
  medicationId: 'm',
  scheduledDate: '2026-11-06',
  scheduledTime: '08:00',
  status,
  takenAt: status === 'TAKEN' ? updatedAt : null,
  confirmedBy: 'A',
  snoozeCount: 0,
  snoozeUntil: null,
  skipReason: null,
  updatedAt,
})

describe('merge de sincronização', () => {
  it('a última edição vence', () => {
    const newer = { ...task, title: 'remoto', updatedAt: '2099-01-01T00:00:00Z' }
    const { state, changed } = applyRemote(base, 'tasks', [{ entity: newer, deleted: false }])
    expect(changed).toBe(1)
    expect(state.tasks[task.id]?.title).toBe('remoto')
    const older = { ...task, title: 'velho', updatedAt: '2000-01-01T00:00:00Z' }
    expect(applyRemote(base, 'tasks', [{ entity: older, deleted: false }]).changed).toBe(0)
  })

  it('dose tomada sempre vence, mesmo que a outra edição seja mais nova', () => {
    expect(pickWinner('medLogs', log('TAKEN', '2026-11-06T08:01:00Z'), log('SNOOZED_WATER', '2026-11-06T08:05:00Z'))).toBe('local')
    expect(pickWinner('medLogs', log('PENDING', '2026-11-06T08:09:00Z'), log('TAKEN', '2026-11-06T08:02:00Z'))).toBe('remote')
  })

  it('item novo do servidor entra; exclusão lógica remove', () => {
    const fresh = { ...task, id: 'novo', updatedAt: '2026-11-06T11:00:00Z' }
    const added = applyRemote(base, 'tasks', [{ entity: fresh, deleted: false }]).state
    expect(added.tasks.novo).toBeTruthy()
    const removed = applyRemote(added, 'tasks', [{ entity: { ...fresh, updatedAt: '2026-11-06T11:05:00Z' }, deleted: true }]).state
    expect(removed.tasks.novo).toBeUndefined()
  })

  it('exclusão antiga não apaga item editado depois neste aparelho', () => {
    const local = { ...task, updatedAt: '2026-11-06T12:00:00Z' }
    const s = { ...base, tasks: { ...base.tasks, [task.id]: local } }
    expect(applyRemote(s, 'tasks', [{ entity: { ...task, updatedAt: '2026-11-06T11:00:00Z' }, deleted: true }]).state.tasks[task.id]).toBeTruthy()
  })

  it('aparelho de uma pessoa: tira lançamentos pessoais do par quando a aba dele(a) fecha', () => {
    const partnerTx = Object.values(base.transactions).find((t) => t.scope === 'PERSONAL' && t.createdBy === 'B') as Transaction
    const closed = { ...base, profiles: { ...base.profiles, B: { ...base.profiles.B!, sharePersonalFinances: false } } }
    const purged = purgeUnauthorized(closed, 'A')
    expect(purged.transactions[partnerTx.id]).toBeUndefined()
    expect(Object.values(purged.transactions).some((t) => t.scope === 'COUPLE')).toBe(true)
    expect(Object.values(purged.transactions).some((t) => t.createdBy === 'A' && t.scope === 'PERSONAL')).toBe(true)
    const open = { ...base, profiles: { ...base.profiles, B: { ...base.profiles.B!, sharePersonalFinances: true } } }
    expect(purgeUnauthorized(open, 'A').transactions[partnerTx.id]).toBeTruthy()
  })
})
