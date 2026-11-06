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

  describe('autorização vencida em remédios, compromissos e tarefas', () => {
    const find = <T extends { id: string }>(m: Record<string, T>, f: (x: T) => boolean) => Object.values(m).find(f) as T
    const magnesio = find(base.meds, (m) => m.name === 'Magnésio') // da B, sem rede de apoio
    const anticoncepcional = find(base.meds, (m) => m.name === 'Anticoncepcional') // da B, com rede de apoio
    const gato = find(base.meds, (m) => m.name === 'Remédio do gato')
    const exame = find(base.events, (e) => e.title === 'Exame de rotina') // "só você vê" da B
    const jantar = find(base.events, (e) => e.title === 'Jantar com a família')
    const orcamento = find(base.tasks, (t) => t.title === 'Revisar orçamento da viagem') // privada da B
    const doseDela = { ...log('PENDING', '2026-11-06T09:00:00Z'), id: 'x@1', medicationId: anticoncepcional.id }

    it('regras locais: tira o que é privado do par, mantém o que é meu, do casal e da rede de apoio', () => {
      const p = purgeUnauthorized({ ...base, medLogs: { [doseDela.id]: doseDela } }, 'A')
      expect(p.meds[magnesio.id]).toBeUndefined()
      expect(p.events[exame.id]).toBeUndefined()
      expect(p.tasks[orcamento.id]).toBeUndefined()
      expect(p.meds[anticoncepcional.id]).toBeTruthy()
      expect(p.medLogs[doseDela.id]).toBeTruthy()
      expect(p.meds[gato.id] && p.events[jantar.id]).toBeTruthy()
      expect(Object.values(p.meds).filter((m) => m.ownerId === 'A')).toHaveLength(2)
    })

    it('rede de apoio desligada lá: a cópia antiga (ainda "ligada") sai pela lista do servidor, com as doses e a fila', () => {
      const s = {
        ...base,
        medLogs: { [doseDela.id]: doseDela },
        outbox: [{ id: 'o1', entityType: 'medLogs' as const, entityId: doseDela.id, operation: 'UPSERT' as const, payload: doseDela, hlc: '1', status: 'FAILED' as const, attempts: 3 }],
      }
      const visible = { meds: new Set(Object.keys(base.meds).filter((id) => id !== anticoncepcional.id)), events: new Set(Object.keys(base.events)), tasks: new Set(Object.keys(base.tasks)) }
      const p = purgeUnauthorized(s, 'A', { visible, since: '2026-11-07T00:00:00Z' })
      expect(p.meds[anticoncepcional.id]).toBeUndefined()
      expect(p.medLogs[doseDela.id]).toBeUndefined()
      expect(p.outbox).toHaveLength(0)
    })

    it('compromisso do casal que virou "só você vê" do par sai; o que ainda está subindo ou mudou agora fica', () => {
      const novo = { ...jantar, id: 'novo-local', updatedAt: '2026-11-07T00:00:01Z' }
      const subindo = { ...jantar, id: 'subindo', updatedAt: '2026-11-06T08:00:00Z' }
      const s = { ...base, events: { ...base.events, [novo.id]: novo, [subindo.id]: subindo } }
      const visible = { events: new Set(Object.keys(base.events).filter((id) => id !== jantar.id)) }
      const p = purgeUnauthorized(s, 'A', { visible, protect: new Set(['subindo']), since: '2026-11-07T00:00:00Z' })
      expect(p.events[jantar.id]).toBeUndefined()
      expect(p.events[novo.id]).toBeTruthy()
      expect(p.events[subindo.id]).toBeTruthy()
      // o que é meu nunca sai, mesmo fora da lista
      const meu = find(base.events, (e) => e.ownerId === 'A')
      expect(purgeUnauthorized(base, 'A', { visible: { events: new Set() } }).events[meu.id]).toBeTruthy()
    })

    it('nada a tirar devolve o mesmo estado (sem re-render nem sync à toa)', () => {
      const clean = purgeUnauthorized(base, 'A')
      expect(purgeUnauthorized(clean, 'A')).toBe(clean)
    })
  })
  describe('ciclo do par', () => {
    const fullB = { ...base, cycleSettings: { B: { ...base.cycleSettings.B!, share: 'FULL' as const } } }
    const logIds = Object.keys(base.cycleLogs)

    it('com "Tudo" o aparelho do Lucas guarda os registros dela', () => {
      expect(Object.keys(purgeUnauthorized(fullB, 'A').cycleLogs)).toEqual(logIds)
    })

    it('ela voltou para "Só o aviso": os registros saem, a janela fica', () => {
      const s = purgeUnauthorized(base, 'A')
      expect(s.cycleLogs).toEqual({})
      expect(s.cycleSettings.B?.sensitiveFrom).toBe(base.cycleSettings.B?.sensitiveFrom)
    })

    it('registro sumido do servidor sai mesmo com a cópia antiga dizendo "Tudo"', () => {
      const s = purgeUnauthorized(fullB, 'A', { visible: { cycleLogs: new Set([logIds[0]!]) } })
      expect(Object.keys(s.cycleLogs)).toEqual([logIds[0]])
    })

    it('o ciclo da própria pessoa nunca sai', () => {
      const s = purgeUnauthorized(base, 'B', { visible: { cycleLogs: new Set(), cycleSettings: new Set() } })
      expect(s.cycleLogs).toBe(base.cycleLogs)
      expect(s.cycleSettings).toBe(base.cycleSettings)
    })
  })
})
