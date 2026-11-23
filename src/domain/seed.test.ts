import { describe, expect, it } from 'vitest'
import { buildEmpty, buildSeed, normalizeState, withIdentity } from './seed'
import { COLLECTIONS, type Collections, type DataState } from './types'

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
    expect(migrated.profiles.A).toMatchObject({ displayName: 'Lucas', monthlyBudgetCents: null, enabledModules: { cycle: true, shopping: true, goals: true, ideas: true } })
    expect(migrated.tasks[taskBefore.id]).toEqual({ ...taskBefore, steps: [], postponeCount: 0 })
    expect(migrated.transactions).toBe(previous.transactions)
    expect(migrated.cycleLogs).toBe(previous.cycleLogs)
    expect(previous.couple.couple!.mode).toBeUndefined()
    expect(previous.tasks[taskBefore.id]!.steps).toBeUndefined()
  })

  it('cria espaço vazio Solo com módulos padrão adequados e mantém o padrão Casal', () => {
    const solo = buildEmpty(now, 'SOLO')
    expect(solo.couple.couple).toMatchObject({ mode: 'SOLO', soloOwnerId: 'A' })
    expect(solo.profiles.A!.enabledModules).toEqual({ cycle: false, shopping: true, goals: true, ideas: true })
    expect(solo.profiles.A!.monthlyBudgetCents).toBeNull()
    expect(solo.tasks).toEqual({})
    expect(solo.transactions).toEqual({})
    expect(buildEmpty(now).couple.couple).toMatchObject({ mode: 'COUPLE', soloOwnerId: null })
    expect(buildEmpty(now).profiles.A!.enabledModules!.cycle).toBe(true)
  })

  it('preserva preferências explícitas, orçamento e micro-passos e é idempotente', () => {
    const state = buildSeed(now)
    const task = Object.values(state.tasks)[0]!
    state.couple.couple!.mode = 'SOLO'
    state.couple.couple!.soloOwnerId = 'A'
    state.profiles.A = { ...state.profiles.A!, monthlyBudgetCents: 125000, enabledModules: { cycle: true, shopping: false, goals: false, ideas: true } }
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
    expect(migrated.profiles.A!.enabledModules).toEqual({ cycle: false, shopping: true, goals: true, ideas: true })
    expect(normalizeState(migrated)).toBe(migrated)
  })

  it('assume A apenas para Solo legado, sem remapear a autoria de registros', () => {
    const state = buildSeed(now)
    state.couple.couple!.mode = 'SOLO'
    delete state.couple.couple!.soloOwnerId
    const migrated = normalizeState(state)
    expect(migrated.couple.couple!.soloOwnerId).toBe('A')
    expect(migrated.tasks).toBe(state.tasks)
    expect(migrated.transactions).toBe(state.transactions)
    expect(migrated.profiles).toBe(state.profiles)
  })

  it('suporta dono B sem trocar identidades e remove o dono individual ao promover para Casal', () => {
    const solo = buildEmpty(now, 'SOLO', 'B')
    const named = withIdentity(solo, { a: { name: 'Perfil A', pronoun: 'ela' }, b: { name: 'Dona B', pronoun: 'ela' }, inviteCode: '', mode: 'SOLO' })
    expect(named.couple.couple!.soloOwnerId).toBe('B')
    expect(named.profiles.A!.id).toBe('A')
    expect(named.profiles.B).toMatchObject({ id: 'B', displayName: 'Dona B' })
    expect(normalizeState(named)).toBe(named)
    const promoted = withIdentity(named, { a: { name: 'Perfil A', pronoun: 'ela' }, b: { name: 'Dona B', pronoun: 'ela' }, inviteCode: 'convite', mode: 'COUPLE' })
    expect(promoted.couple.couple).toMatchObject({ mode: 'COUPLE', soloOwnerId: null })
  })

  it('preserva arquivos cifrados fora das coleções ativas e da fila, sem normalizar seu histórico', () => {
    const archived = buildSeed(now)
    const collections = Object.fromEntries(COLLECTIONS.map((collection) => [collection, archived[collection]])) as unknown as Collections
    const state = { ...buildEmpty(now, 'SOLO', 'B'), coupleArchives: [{ savedAt: now.toISOString(), ownerId: 'B' as const, collections }] }
    const result = normalizeState(state)
    expect(result.coupleArchives).toBe(state.coupleArchives)
    expect(result.coupleArchives![0]!.collections.tasks).toBe(archived.tasks)
    expect(result.tasks).toEqual({})
    expect(result.outbox).toEqual([])
    expect(COLLECTIONS).not.toContain('coupleArchives')
  })
})
