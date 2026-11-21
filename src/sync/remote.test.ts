import { describe, expect, it } from 'vitest'
import { fromRow, toRow } from './remote'

describe('mapeamento do modo dual para Supabase', () => {
  it('envia o modo Solo e mantém convite e identificador local fora da linha', () => {
    const row = toRow('couple', {
      id: 'couple', spaceId: 'outro-id', mode: 'SOLO', inviteCode: 'SEGREDO',
      splitMode: '50_50', ratioABps: 5000, pairedAt: '2026-11-20T10:00:00Z',
    }, 'space-solo')
    expect(row).toMatchObject({ id: 'space-solo', mode: 'SOLO', split_mode: '50_50', ratio_a_bps: 5000 })
    expect(row).not.toHaveProperty('invite_code')
    expect(row).not.toHaveProperty('space_id')
    expect(JSON.stringify(row)).not.toContain('SEGREDO')
  })

  it('envia casal por padrão para dados anteriores ao modo dual', () => {
    expect(toRow('couple', { splitMode: '50_50', ratioABps: 5000 }, 'antigo').mode).toBe('COUPLE')
  })

  it('recupera modo e id local sem importar o convite do servidor', () => {
    const { entity } = fromRow('couple', { id: 'space-solo', mode: 'SOLO', invite_code: 'NUNCA', synced_at: 'cursor' })
    expect(entity).toEqual({ id: 'couple', spaceId: 'space-solo', mode: 'SOLO' })
  })

  it('normaliza espaço de servidor antigo para casal', () => {
    expect(fromRow('couple', { id: 'space-old' }).entity).toEqual({ id: 'couple', spaceId: 'space-old', mode: 'COUPLE' })
  })

  it('faz ida e volta do orçamento em centavos e módulos por pessoa', () => {
    const profile = { id: 'A', monthlyBudgetCents: 154099, enabledModules: { cycle: false, shopping: true, goals: false } }
    const row = toRow('profiles', profile, 'space-solo')
    expect(row).toEqual({ id: 'A', couple_id: 'space-solo', monthly_budget_cents: 154099, enabled_modules: profile.enabledModules })
    expect(fromRow('profiles', row).entity).toEqual(profile)
  })

  it('preserva orçamento nulo e deixa normalização dos módulos legados para o modo do espaço', () => {
    expect(fromRow('profiles', { id: 'A', enabled_modules: null, monthly_budget_cents: null }).entity).toEqual({ id: 'A', monthlyBudgetCents: null })
  })

  it('faz ida e volta dos micro-passos e contagem sem alterar ids ou textos', () => {
    const task = { id: 'task-1', steps: [{ id: 'passo-1', text: 'Abrir a pasta', done: true }, { id: 'passo-2', text: 'Separar uma folha', done: false }], postponeCount: 3 }
    const row = toRow('tasks', task, 'space-solo')
    expect(row).toMatchObject({ couple_id: 'space-solo', steps: task.steps, postpone_count: 3 })
    expect(fromRow('tasks', row).entity).toEqual(task)
  })

  it('envia e recebe padrões seguros para tarefas legadas', () => {
    expect(toRow('tasks', { id: 'old' }, 'space')).toMatchObject({ steps: [], postpone_count: 0 })
    expect(fromRow('tasks', { id: 'old', steps: null }).entity).toEqual({ id: 'old', steps: [], postponeCount: 0 })
  })

  it('mantém datas e exclusão lógica na mesma conversão', () => {
    expect(fromRow('tasks', { id: 't', updated_at: '2026-11-20T08:00:00-04:00', deleted: true, synced_at: 'cursor' })).toEqual({
      entity: { id: 't', updatedAt: '2026-11-20T12:00:00.000Z', steps: [], postponeCount: 0 }, deleted: true, syncedAt: 'cursor',
    })
  })
})
