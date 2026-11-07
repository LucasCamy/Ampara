import { describe, expect, it } from 'vitest'
import { computeCoupleBalance } from './finance'
import {
  addMonths,
  buildInstallments,
  dayInMonth,
  GENERATED_AT,
  isOverdue,
  missingOccurrences,
  monthTitle,
  occurrenceId,
  payTx,
  seededUuid,
  shiftMonth,
  splitInstallments,
  txBadge,
  unpayTx,
  validateRepeat,
} from './ledger'
import type { RecurringRule, Transaction } from './types'

const tx = (p: Partial<Transaction> = {}): Transaction => ({
  id: 't',
  createdBy: 'A',
  paidBy: 'A',
  scope: 'COUPLE',
  isSecretGift: false,
  type: 'EXPENSE',
  status: 'PREDICTED_DASHED',
  amountCents: 20000,
  category: 'HOME',
  description: 'Luz',
  splitRule: '50_50',
  partnerAShareCents: 10000,
  partnerBShareCents: 10000,
  competenceDate: '2026-11-10',
  updatedAt: '',
  ...p,
})

const rule = (p: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  createdBy: 'A',
  scope: 'COUPLE',
  description: 'Aluguel',
  category: 'HOME',
  amountCents: 240000,
  paidBy: 'A',
  splitRule: 'PROPORTIONAL',
  dayOfMonth: 31,
  startMonth: '2026-11',
  endMonth: null,
  skipMonths: [],
  updatedAt: '',
  ...p,
})

describe('ids e meses', () => {
  it('uuid determinístico, no formato do Postgres', () => {
    expect(seededUuid('a')).toBe(seededUuid('a'))
    expect(seededUuid('a')).not.toBe(seededUuid('b'))
    expect(seededUuid('rec:r1:2026-11')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('meses e dias no limite', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(dayInMonth('2027-02', 31)).toBe('2027-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthTitle('2026-12', '2026-11')).toBe('dezembro')
    expect(monthTitle('2027-01', '2026-11')).toBe('janeiro de 2027')
  })
})

describe('dar baixa', () => {
  it('paga com o valor real e quem pagou, sem mudar o mês; desfazer volta a previsto', () => {
    const paid = payTx(tx(), { amountCents: 23410, paidBy: 'B', paidAt: '2026-12-02' }, 5000, 'agora')
    expect(paid).toMatchObject({ status: 'CONFIRMED_SOLID', amountCents: 23410, paidBy: 'B', paidAt: '2026-12-02', competenceDate: '2026-11-10' })
    expect(paid.partnerAShareCents + paid.partnerBShareCents).toBe(23410)
    // entra no saldo de novembro (competência), não de dezembro
    expect(computeCoupleBalance([paid], '2026-11').netCents).toBe(-11705)
    expect(unpayTx(paid, 'depois')).toMatchObject({ status: 'PREDICTED_DASHED', paidAt: null })
  })

  it('pessoal: a parte é toda do dono, quem pagou não muda', () => {
    const p = payTx(tx({ scope: 'PERSONAL', createdBy: 'B', paidBy: 'B', splitRule: null }), { amountCents: 5000, paidBy: 'A', paidAt: '2026-11-10' }, 5000, '')
    expect(p).toMatchObject({ paidBy: 'B', partnerAShareCents: 0, partnerBShareCents: 5000 })
  })

  it('vencido: previsto com data passada', () => {
    expect(isOverdue(tx(), '2026-11-11')).toBe(true)
    expect(isOverdue(tx(), '2026-11-10')).toBe(false)
    expect(isOverdue(tx({ status: 'CONFIRMED_SOLID' }), '2026-12-01')).toBe(false)
  })
})

describe('parcelas', () => {
  it('centavos exatos, resto na primeira', () => {
    expect(splitInstallments(100000, 3)).toEqual([33334, 33333, 33333])
    expect(splitInstallments(100000, 3).reduce((a, b) => a + b, 0)).toBe(100000)
  })

  it('uma por mês, só a primeira com o status escolhido, mesmo grupo e ids estáveis', () => {
    const { id: _id, amountCents: _a, competenceDate: _c, partnerAShareCents: _pa, partnerBShareCents: _pb, ...first } = tx({ status: 'CONFIRMED_SOLID', description: 'Geladeira' })
    void [_id, _a, _c, _pa, _pb]
    const parts = buildInstallments(first, 300001, 3, '2026-01-31', 'g1', 5000)
    expect(parts.map((p) => [p.competenceDate, p.amountCents, p.status, txBadge(p)])).toEqual([
      ['2026-01-31', 100001, 'CONFIRMED_SOLID', 'Parcela 1/3'],
      ['2026-02-28', 100000, 'PREDICTED_DASHED', 'Parcela 2/3'],
      ['2026-03-31', 100000, 'PREDICTED_DASHED', 'Parcela 3/3'],
    ])
    expect(parts.every((p) => p.partnerAShareCents + p.partnerBShareCents === p.amountCents)).toBe(true)
    expect(buildInstallments(first, 300001, 3, '2026-01-31', 'g1', 5000).map((p) => p.id)).toEqual(parts.map((p) => p.id))
  })

  it('validação', () => {
    expect(validateRepeat('INSTALLMENTS', '1', 1000)).toMatch(/De 2/)
    expect(validateRepeat('INSTALLMENTS', '49', 1000)).toMatch(/De 2/)
    expect(validateRepeat('INSTALLMENTS', '10', 5)).toMatch(/menor/)
    expect(validateRepeat('INSTALLMENTS', '10', 100000)).toBeUndefined()
    expect(validateRepeat('MONTHLY', '', 0)).toBeUndefined()
  })
})

describe('contas fixas', () => {
  it('gera do mês atual até o horizonte, no dia certo, sem passado', () => {
    const occ = missingOccurrences([rule({ startMonth: '2026-09' })], {}, '2026-11', 6000)
    expect(occ.map((o) => o.competenceDate)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])
    expect(occ[0]).toMatchObject({ status: 'PREDICTED_DASHED', recurrenceId: 'r1', updatedAt: GENERATED_AT, amountCents: 240000 })
    expect(occ[0]!.partnerAShareCents).toBe(144000)
  })

  it('não recria o que já existe (paga ou editada), nem mês pulado ou depois do fim', () => {
    const paid = { [occurrenceId('r1', '2026-11')]: tx({ status: 'CONFIRMED_SOLID' }) }
    expect(missingOccurrences([rule({ skipMonths: ['2026-12'], endMonth: '2027-01' })], paid, '2026-11', 5000).map((o) => o.competenceDate)).toEqual(['2027-01-31'])
    expect(missingOccurrences([rule({ endMonth: '2026-10' })], {}, '2026-11', 5000)).toEqual([])
  })

  it('os dois aparelhos geram o mesmo id', () => {
    expect(missingOccurrences([rule()], {}, '2026-11', 5000)[0]!.id).toBe(occurrenceId('r1', '2026-11'))
  })
})
