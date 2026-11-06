import { findDuplicate, parseShoppingLine } from '../domain/shopping'
import { uuid } from '../domain/seed'
import type { ShopCategory, ShoppingItem } from '../domain/types'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'

/** Lista de compras do casal: ações rápidas, sem confirmação, sempre com Desfazer */

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer
const items = () => Object.values(dataStore.get().shoppingItems)

/** Adiciona uma linha ("2 kg arroz"). Devolve false se vazia ou repetida (o Toast explica). */
export function addShoppingItem(line: string, category: ShopCategory, sourceMedicationId: string | null = null): boolean {
  const parsed = parseShoppingLine(line)
  if (!parsed) return false
  const dup = findDuplicate(items(), parsed.title)
  if (dup) {
    ui.toast(`${dup.title} já está na lista`, { tone: 'info' })
    return false
  }
  const iso = nowIso()
  const item: ShoppingItem = {
    id: uuid(),
    title: parsed.title,
    quantity: parsed.quantity,
    category,
    addedBy: viewer(),
    checked: false,
    checkedBy: null,
    sourceMedicationId,
    createdAt: iso,
    updatedAt: iso,
  }
  transact((tx) => tx.put('shoppingItems', item))
  return true
}

/** Marca/desmarca no carrinho (anti-flick: troca na hora, sem toast) */
export function toggleShoppingItem(id: string) {
  const prev = dataStore.get().shoppingItems[id]
  if (!prev) return
  const checked = !prev.checked
  transact((tx) => tx.put('shoppingItems', { ...prev, checked, checkedBy: checked ? viewer() : null, updatedAt: nowIso() }))
}

export function removeShoppingItem(id: string) {
  const prev = dataStore.get().shoppingItems[id]
  if (!prev) return
  const undo = transact((tx) => tx.remove('shoppingItems', id))
  ui.toast(`${prev.title} saiu da lista`, { undo })
}

/** Terminar a compra: tira do carrinho o que foi pego. Devolve quantos itens saíram. */
export function finishShopping(): number {
  const done = items().filter((i) => i.checked)
  if (!done.length) return 0
  const undo = transact((tx) => {
    for (const i of done) tx.remove('shoppingItems', i.id)
  })
  ui.toast(done.length === 1 ? '1 item comprado saiu da lista' : `${done.length} itens comprados saíram da lista`, { undo })
  return done.length
}
