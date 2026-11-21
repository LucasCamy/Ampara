import { describe, expect, it } from 'vitest'
import { FakeSupabase } from '../../e2e/fake-supabase'

describe('espelho dos privilégios mínimos do worker', () => {
  it('só entrega contas previstas e eventos de pessoas inscritas, sem colunas financeiras', () => {
    const fake = new FakeSupabase()
    fake.pushSubs.set('https://push.test/a', { couple_id: 'space', partner_id: 'A', p256dh: '', auth: '', tz: '', show_details: false, prefs: {} })
    fake.tables.set('couples', new Map([['space', { id: 'space', mode: 'SOLO', invite_code: 'segredo' }]]))
    fake.tables.set('transactions', new Map([
      ['a', { id: 'a', couple_id: 'space', created_by: 'A', scope: 'PERSONAL', status: 'PREDICTED_DASHED', type: 'EXPENSE', amount_cents: 3500 }],
      ['b', { id: 'b', couple_id: 'space', created_by: 'B', scope: 'PERSONAL', status: 'PREDICTED_DASHED', type: 'EXPENSE' }],
      ['paid', { id: 'paid', couple_id: 'space', created_by: 'A', scope: 'PERSONAL', status: 'CONFIRMED_SOLID', type: 'EXPENSE' }],
      ['income', { id: 'income', couple_id: 'space', created_by: 'A', scope: 'PERSONAL', status: 'PREDICTED_DASHED', type: 'INCOME' }],
    ]))
    fake.tables.set('events', new Map([
      ['own', { id: 'own', couple_id: 'space', owner_id: 'A' }],
      ['partner', { id: 'partner', couple_id: 'space', owner_id: 'B' }],
      ['shared', { id: 'shared', couple_id: 'space', owner_id: null }],
      ['deleted', { id: 'deleted', couple_id: 'space', owner_id: 'A', deleted: true }],
    ]))
    expect(fake.workerRows('couples', ['id', 'mode'])).toEqual([{ id: 'space', mode: 'SOLO' }])
    expect(fake.workerRows('transactions', ['id'])).toEqual([{ id: 'a' }])
    expect(fake.workerRows('events', ['id'])).toEqual([{ id: 'own' }, { id: 'shared' }])
    expect(() => fake.workerRows('transactions', ['amount_cents'])).toThrow()
    expect(() => fake.workerRows('couples', ['invite_code'])).toThrow()
    expect(() => fake.workerRows('profiles', ['monthly_budget_cents'])).toThrow()
  })
})
