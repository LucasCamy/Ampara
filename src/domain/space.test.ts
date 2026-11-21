import { describe, expect, it } from 'vitest'
import { makeEntry } from './outbox'
import { buildEmpty } from './seed'
import { applySpaceMode } from './space'

describe('autoridade do modo do espaço', () => {
  it('harmoniza a fila antiga sem perder a edição de divisão nem alterar outras entidades', () => {
    const state = buildEmpty(new Date('2026-11-21T12:00:00Z'))
    const couple = { ...state.couple.couple!, splitMode: 'PROPORTIONAL' as const, ratioABps: 7200, updatedAt: '2099-01-01T00:00:00Z' }
    state.couple = { couple }
    state.outbox = [makeEntry('couple', 'couple', 'UPSERT', couple, 1, 'divisao'), makeEntry('profiles', 'A', 'UPSERT', state.profiles.A, 2, 'perfil')]
    const solo = applySpaceMode(state, { mode: 'SOLO', soloOwnerId: 'B' })
    expect(solo.couple.couple).toMatchObject({ mode: 'SOLO', soloOwnerId: 'B', inviteCode: '', splitMode: 'PROPORTIONAL', ratioABps: 7200, updatedAt: '2099-01-01T00:00:00Z' })
    expect(solo.outbox[0]?.payload).toMatchObject({ mode: 'SOLO', soloOwnerId: 'B', splitMode: 'PROPORTIONAL', ratioABps: 7200 })
    expect(solo.outbox[0]?.id).toBe('divisao')
    expect(solo.outbox[1]).toBe(state.outbox[1])
    expect(solo.tasks).toBe(state.tasks)
    expect(state.couple.couple?.mode).toBe('COUPLE')
    const restored = applySpaceMode(solo, { mode: 'COUPLE', soloOwnerId: null })
    expect(restored.outbox[0]?.payload).toMatchObject({ mode: 'COUPLE', soloOwnerId: null, ratioABps: 7200 })
  })
})
