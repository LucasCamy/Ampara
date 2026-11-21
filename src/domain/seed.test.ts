import { describe, expect, it } from 'vitest'
import { buildEmpty, buildSeed, normalizeState } from './seed'
import type { DataState } from './types'

const now = new Date('2026-11-20T12:00:00Z')

describe('modo do espaço e compatibilidade dos dados', () => {
  it('completa cofres anteriores como casal sem mudar tarefas, dinheiro ou identidade', () => {
    const previous = buildSeed(now)
    delete previous.couple.couple!.mode
    for (const profile of Object.values(previous.profiles)) {
      delete profile.enabledModules
      delete profile.monthlyBudgetCents
    }
    for (const task of Object.values(previous.tasks)) {
      delete task.steps
      delete task.postponeCount
    }
    const taskBefore = Object.values(previous.tasks)[0]!
    const migrated = normalizeState(previous)
    expect(migrated.couple.couple).toMatchObject({ mode: 'COUPLE', inviteCode: previous.couple.couple!.inviteCode })
    expect(migrated.profiles.A).toMatchObject({ displayName: 'Lucas', monthlyBudgetCents: null, enabledModules: { cycle: true, shopping: true, goals: true } })
    expect(migrated.tasks[taskBefore.id]).toEqual({ ...taskBefore, steps: [], postponeCount: 0 })
    expect(migrated.transactions).toBe(previous.transactions)
    expect(migrated.cycleLogs).toBe(previous.cycleLogs)
    expect(previous.couple.couple!.mode).toBeUndefined()
    expect(previous.tasks[taskBefore.id]!.steps).toBeUndefined()
  })

  it('cria espaço vazio Solo com módulos padrão adequados e mantém o padrão Casal', () => {
    const solo = buildEmpty(now, 'SOLO')
    expect(solo.couple.couple!.mode).toBe('SOLO')
    expect(solo.profiles.A!.enabledModules).toEqual({ cycle: false, shopping: true, goals: true })
    expect(solo.profiles.A!.monthlyBudgetCents).toBeNull()
    expect(solo.tasks).toEqual({})
    expect(solo.transactions).toEqual({})
    expect(buildEmpty(now).couple.couple!.mode).toBe('COUPLE')
    expect(buildEmpty(now).profiles.A!.enabledModules!.cycle).toBe(true)
  })

  it('preserva preferências explícitas, orçamento e micro-passos e é idempotente', () => {
    const state = buildSeed(now)
    const task = Object.values(state.tasks)[0]!
    state.couple.couple!.mode = 'SOLO'
    state.profiles.A = { ...state.profiles.A!, monthlyBudgetCents: 125000, enabledModules: { cycle: true, shopping: false, goals: false } }
    state.tasks[task.id] = { ...task, steps: [{ id: 'passo', text: 'Abrir a lista', done: true }], postponeCount: 3 }
    expect(normalizeState(state)).toBe(state)
    expect(normalizeState(normalizeState(state))).toBe(state)
  })

  it('completa coleções ausentes e prefere defaults Solo nos perfis antigos desse modo', () => {
    const state = buildEmpty(now, 'SOLO')
    delete state.profiles.A!.enabledModules
    const old = { ...state, shoppingItems: undefined, recurrences: undefined } as unknown as DataState
    const migrated = normalizeState(old)
    expect(migrated.shoppingItems).toEqual({})
    expect(migrated.recurrences).toEqual({})
    expect(migrated.profiles.A!.enabledModules).toEqual({ cycle: false, shopping: true, goals: true })
    expect(normalizeState(migrated)).toBe(migrated)
  })
})
