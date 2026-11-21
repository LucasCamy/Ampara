import { describe, expect, it } from 'vitest'
import { findDuplicate, findMedicationItem, parseShoppingLine, shoppingExpenseDraft, shoppingView } from './shopping'
import type { ShoppingItem } from './types'

const item = (p: Partial<ShoppingItem> & Pick<ShoppingItem, 'id' | 'title'>): ShoppingItem => ({
  quantity: null,
  category: 'MARKET',
  addedBy: 'A',
  checked: false,
  checkedBy: null,
  sourceMedicationId: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
  ...p,
})

describe('captura de item', () => {
  it.each([
    ['café', 'Café', null],
    ['2 kg arroz', 'Arroz', '2 kg'],
    ['3 leite', 'Leite', '3'],
    ['leite x3', 'Leite', '3'],
    ['ovos 1 dz', 'Ovos', '1 dz'],
    ['  pão   de   forma ', 'Pão de forma', null],
    ['papel higiênico 12', 'Papel higiênico', '12'],
  ])('"%s"', (raw, title, quantity) => {
    expect(parseShoppingLine(raw)).toEqual({ title, quantity })
  })

  it('linha vazia não vira item', () => {
    expect(parseShoppingLine('   ')).toBeNull()
  })
})

describe('lista', () => {
  const items = [
    item({ id: '1', title: 'Pão', createdAt: '2026-11-06T09:00:00.000Z' }),
    item({ id: '2', title: 'Dipirona', category: 'PHARMACY' }),
    item({ id: '3', title: 'Café', checked: true, updatedAt: '2026-11-06T11:00:00.000Z' }),
    item({ id: '4', title: 'Açúcar', createdAt: '2026-11-06T09:30:00.000Z' }),
  ]

  it('duplicado ignora acento e maiúscula, mas não o que já está no carrinho', () => {
    expect(findDuplicate(items, 'acucar')?.id).toBe('4')
    expect(findDuplicate(items, 'café')).toBeUndefined()
  })

  it('agrupa por loja na ordem de chegada e separa o carrinho', () => {
    const v = shoppingView(items)
    expect(v.groups.map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
      ['MARKET', ['1', '4']],
      ['PHARMACY', ['2']],
    ])
    expect(v.inCart.map((i) => i.id)).toEqual(['3'])
    expect(v.pending).toBe(3)
  })

  it('uma reposição aberta é identificada pelo remédio mesmo depois de renomear o item', () => {
    const open = item({ id: 'repo', title: 'Nome antigo', sourceMedicationId: 'med-1' })
    const purchased = item({ id: 'anterior', title: 'Nome novo', sourceMedicationId: 'med-1', checked: true })
    expect(findMedicationItem([purchased, open], 'med-1')).toBe(open)
    expect(findMedicationItem([purchased], 'med-1')).toBeUndefined()
  })
})

describe('gasto das compras', () => {
  it('não abre um gasto quando nada foi comprado', () => {
    expect(shoppingExpenseDraft([item({ id: 'aberto', title: 'Arroz' })])).toBeNull()
  })

  it.each([
    ['MARKET', 'Compras do mercado', 'MARKET'],
    ['PHARMACY', 'Compras da farmácia', 'HEALTH'],
    ['HOME', 'Compras para casa', 'HOME'],
    ['OTHER', 'Compras', 'OTHER'],
  ] as const)('pré-preenche a categoria %s sem inventar o valor', (category, title, expenseCategory) => {
    const draft = shoppingExpenseDraft([item({ id: 'comprado', title: 'Um item', category, checked: true }), item({ id: 'a-comprar', title: 'Outro item' })])
    expect(draft).toEqual({ title, category: expenseCategory, ids: ['comprado'] })
    expect(draft).not.toHaveProperty('amountCents')
  })

  it('uma compra mista inclui somente os ids marcados e mantém categoria neutra', () => {
    expect(shoppingExpenseDraft([
      item({ id: 'mercado', title: 'Arroz', checked: true }),
      item({ id: 'farmacia', title: 'Remédio', checked: true, category: 'PHARMACY' }),
      item({ id: 'pendente', title: 'Sabão', category: 'HOME' }),
    ])).toEqual({ title: 'Compras', category: 'OTHER', ids: ['mercado', 'farmacia'] })
  })
})
