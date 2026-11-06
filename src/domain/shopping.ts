import type { ShopCategory, ShoppingItem } from './types'

/** Lista de compras: captura em uma linha ("2 kg arroz", "leite x3"), sem duplicar, agrupada por loja */

export const SHOP_CATEGORY: Record<ShopCategory, { label: string; short: string }> = {
  MARKET: { label: 'Mercado', short: 'Mercado' },
  PHARMACY: { label: 'Farmácia', short: 'Farmácia' },
  HOME: { label: 'Casa', short: 'Casa' },
  OTHER: { label: 'Outros', short: 'Outros' },
}
export const SHOP_ORDER: ShopCategory[] = ['MARKET', 'PHARMACY', 'HOME', 'OTHER']

const UNIT = '(?:x|un|und|kg|g|l|ml|pct|pcts|cx|dz)'

/**
 * "2 kg arroz" -> { title: "arroz", quantity: "2 kg" }; "leite x3" -> { title: "leite", quantity: "3" };
 * "café" -> { title: "café", quantity: null }. Título com maiúscula inicial, até 60 caracteres.
 */
export function parseShoppingLine(raw: string): { title: string; quantity: string | null } | null {
  const line = raw.trim().replace(/\s+/g, ' ')
  if (!line) return null
  let title = line
  let quantity: string | null = null
  const lead = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\s+(.+)$`, 'i').exec(line)
  const trail = new RegExp(`^(.+?)\\s+(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?$`, 'i').exec(line)
  if (lead) {
    const unit = lead[2]?.toLowerCase()
    quantity = unit && unit !== 'x' ? `${lead[1]} ${unit}` : lead[1]!
    title = lead[3]!
  } else if (trail && /\s(x\s*)?\d/i.test(line)) {
    const unit = trail[3]?.toLowerCase()
    quantity = unit && unit !== 'x' ? `${trail[2]} ${unit}` : trail[2]!
    title = trail[1]!
  }
  title = title.trim().slice(0, 60)
  if (!title) return null
  return { title: title.charAt(0).toUpperCase() + title.slice(1), quantity }
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Já está na lista (ainda não comprado), sem diferenciar acento e maiúscula */
export function findDuplicate(items: ShoppingItem[], title: string): ShoppingItem | undefined {
  const t = norm(title)
  return items.find((i) => !i.checked && norm(i.title) === t)
}

export interface ShoppingView {
  groups: { category: ShopCategory; items: ShoppingItem[] }[]
  /** no carrinho, mais recente primeiro */
  inCart: ShoppingItem[]
  pending: number
}

export function shoppingView(items: ShoppingItem[]): ShoppingView {
  const open = items.filter((i) => !i.checked).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return {
    groups: SHOP_ORDER.map((category) => ({ category, items: open.filter((i) => i.category === category) })).filter((g) => g.items.length),
    inCart: items.filter((i) => i.checked).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    pending: open.length,
  }
}
