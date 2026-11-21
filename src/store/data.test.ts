import { beforeEach, describe, expect, it } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { dataStore, enqueueAll, resetData } from './data'
import { buildFocusSession } from '../domain/together'

beforeEach(() => dataStore.set(() => buildEmpty(new Date('2026-11-20T12:00:00Z'))))

describe('restaurar exemplo e modo do espaço', () => {
  it('primeira subida cria somente focos de quem está na sessão, sem forjar autoria do par', () => {
    const now = new Date('2026-11-21T10:00:00')
    const own = buildFocusSession({ id: 'own', title: 'Meu foco', minutes: 5, startedBy: 'A' }, now)!
    const partner = buildFocusSession({ id: 'partner', title: 'Foco do par', minutes: 5, startedBy: 'B' }, now)!
    dataStore.set((state) => ({ ...state, focusSessions: { own, partner } }))
    enqueueAll('A')
    expect(dataStore.get().outbox.filter((entry) => entry.entityType === 'focusSessions').map((entry) => entry.entityId)).toEqual(['own'])
  })
  it('preserva vínculo, privacidade, módulos e orçamento do casal', () => {
    dataStore.set((s) => ({
      ...s,
      couple: { couple: { ...s.couple.couple!, spaceId: 'espaco-na-nuvem', splitMode: 'PROPORTIONAL', ratioABps: 7000 } },
      profiles: { ...s.profiles, A: { ...s.profiles.A!, sharePersonalFinances: false, monthlyBudgetCents: 100000, enabledModules: { cycle: false, shopping: false, goals: true } } },
    }))
    const before = dataStore.get()
    resetData()
    const after = dataStore.get()
    expect(after.couple).toBe(before.couple)
    expect(after.profiles.A).toMatchObject({ sharePersonalFinances: false, monthlyBudgetCents: 100000, enabledModules: { cycle: false, shopping: false, goals: true } })
    expect(Object.keys(after.tasks).length).toBeGreaterThan(0)
  })

  it('não importa o exemplo de casal para um espaço Solo', () => {
    const solo = buildEmpty(new Date(), 'SOLO')
    dataStore.set(() => solo)
    resetData()
    expect(dataStore.get()).toBe(solo)
  })
})
