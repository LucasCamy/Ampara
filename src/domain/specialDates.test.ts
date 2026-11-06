import { describe, expect, it } from 'vitest'
import { isDateKey } from './catalog'
import { canViewGift, datesToRemind, describeUpcoming, giftsFor, nextOccurrence, specialDateTitle, upcomingDates, validateSpecialDate } from './specialDates'
import type { GiftIdea, SpecialDate } from './types'

const sd = (p: Partial<SpecialDate> & Pick<SpecialDate, 'id' | 'date'>): SpecialDate => ({
  title: 'Data',
  kind: 'OTHER',
  personId: null,
  createdBy: 'A',
  updatedAt: '',
  ...p,
})

describe('datas especiais', () => {
  it('próxima ocorrência: este ano, ano que vem e 29/02', () => {
    expect(nextOccurrence('2023-11-20', '2026-11-06')).toBe('2026-11-20')
    expect(nextOccurrence('2023-11-06', '2026-11-06')).toBe('2026-11-06')
    expect(nextOccurrence('2023-03-10', '2026-11-06')).toBe('2027-03-10')
    expect(nextOccurrence('2024-02-29', '2026-11-06')).toBe('2027-02-28')
    expect(nextOccurrence('2024-02-29', '2027-11-06')).toBe('2028-02-29')
  })

  it('ordena pela mais próxima, conta os anos e lembra só na semana', () => {
    const all = [sd({ id: 'a', date: '2023-11-10', kind: 'ANNIVERSARY', title: 'Namoro' }), sd({ id: 'b', date: '1996-12-25', kind: 'BIRTHDAY', personId: 'B' })]
    const up = upcomingDates(all, '2026-11-06')
    expect(up.map((u) => [u.item.id, u.inDays, u.years])).toEqual([
      ['a', 4, 3],
      ['b', 49, 30],
    ])
    expect(describeUpcoming(up[0]!)).toBe('3 anos de namoro')
    expect(describeUpcoming(up[1]!, 'Julia')).toBe('30 anos de Julia')
    expect(datesToRemind(all, '2026-11-06').map((u) => u.item.id)).toEqual(['a'])
  })

  it('formulário: título padrão e validação', () => {
    const names = { A: 'Lucas Camy', B: 'Julia Aparecida' }
    expect(specialDateTitle({ title: '', date: '', kind: 'BIRTHDAY', personId: 'B' }, names)).toBe('Aniversário de Julia')
    expect(specialDateTitle({ title: '', date: '', kind: 'ANNIVERSARY', personId: null }, names)).toBe('Aniversário de namoro')
    expect(validateSpecialDate({ title: '', date: '2026-01-01', kind: 'OTHER', personId: null }, '2026-11-06', isDateKey).title).toBeTruthy()
    expect(validateSpecialDate({ title: 'X', date: '', kind: 'OTHER', personId: null }, '2026-11-06', isDateKey).date).toBeTruthy()
    expect(validateSpecialDate({ title: '', date: '2023-11-10', kind: 'ANNIVERSARY', personId: null }, '2026-11-06', isDateKey)).toEqual({})
  })
})

describe('presentes são surpresa', () => {
  const g = (id: string, ownerId: 'A' | 'B', status: GiftIdea['status'] = 'IDEA'): GiftIdea => ({
    id,
    ownerId,
    title: id,
    note: '',
    specialDateId: null,
    status,
    createdAt: id,
    updatedAt: '',
  })

  it('o par nunca vê as ideias de quem anotou, mesmo no mesmo aparelho', () => {
    expect(canViewGift(g('x', 'A'), 'B')).toBe(false)
    expect(giftsFor([g('1', 'A'), g('2', 'B'), g('3', 'A', 'BOUGHT'), g('4', 'A')], 'A').map((x) => x.id)).toEqual(['4', '1', '3'])
  })
})
