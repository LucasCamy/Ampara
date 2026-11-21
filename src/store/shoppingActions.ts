import { findDuplicate, findMedicationItem, parseShoppingLine } from '../domain/shopping'
import { isLowStock } from '../domain/medication'
import { uuid } from '../domain/seed'
import type { ShopCategory, ShoppingItem } from '../domain/types'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'
import { restock } from './actions'

/** Lista de compras do casal: ações rápidas, sem confirmação, sempre com Desfazer */

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer
const items = () => Object.values(dataStore.get().shoppingItems)

/** Adiciona uma linha ("2 kg arroz"). Devolve false se vazia ou repetida (o Toast explica). */
export function addShoppingItem(line: string, category: ShopCategory, sourceMedicationId: string | null = null, notify = false): boolean {
  const med = sourceMedicationId ? dataStore.get().meds[sourceMedicationId] : undefined
  if (sourceMedicationId && (!med || (med.ownerId !== null && med.ownerId !== viewer()))) return false
  const parsed = med ? { title: med.name.trim().slice(0, 60), quantity: null } : parseShoppingLine(line)
  if (!parsed?.title) return false
  const linked = sourceMedicationId ? findMedicationItem(items(), sourceMedicationId) : undefined
  if (linked) {
    ui.toast(`${linked.title} já está na lista`, { tone: 'info' })
    return false
  }
  const dup = findDuplicate(items(), parsed.title)
  if (dup) {
    if (sourceMedicationId && !dup.sourceMedicationId) {
      const undo = transact((tx) => tx.put('shoppingItems', { ...dup, category: 'PHARMACY', sourceMedicationId, updatedAt: nowIso() }))
      ui.toast(`${dup.title} vinculado ao estoque`, { undo })
      return true
    }
    ui.toast(`${dup.title} já está na lista`, { tone: 'info' })
    return false
  }
  const iso = nowIso()
  const item: ShoppingItem = {
    id: uuid(),
    title: parsed.title,
    quantity: parsed.quantity,
    category: sourceMedicationId ? 'PHARMACY' : category,
    addedBy: viewer(),
    checked: false,
    checkedBy: null,
    sourceMedicationId,
    createdAt: iso,
    updatedAt: iso,
  }
  const undo = transact((tx) => tx.put('shoppingItems', item))
  if (sourceMedicationId || notify) ui.toast(`${item.title} entrou na lista de compras`, { undo })
  return true
}

/** Estoque baixo vira reposição da farmácia em um toque, sem duplicar uma compra aberta. */
export function addMedicationToShopping(medicationId: string): boolean {
  const med = dataStore.get().meds[medicationId]
  if (!med || !isLowStock(med)) return false
  return addShoppingItem(med.name, 'PHARMACY', med.id)
}

/** Marca/desmarca no carrinho (anti-flick: troca na hora, sem toast) */
export function toggleShoppingItem(id: string) {
  const prev = dataStore.get().shoppingItems[id]
  if (!prev) return
  const checked = !prev.checked
  const undo = transact((tx) => tx.put('shoppingItems', { ...prev, checked, checkedBy: checked ? viewer() : null, updatedAt: nowIso() }))
  const med = checked && prev.sourceMedicationId ? dataStore.get().meds[prev.sourceMedicationId] : undefined
  if (med && med.stockCount !== null && (med.ownerId === viewer() || med.ownerId === null)) {
    const amount = med.pack ? med.pack.activeDays * med.times.length : 30
    let replenished = false
    ui.toast(`Comprado: ${prev.title} · repor ${amount} ${med.stockUnit || 'unidades'}`, {
      undo,
      action: {
        label: 'Repor estoque',
        onClick: () => {
          const current = dataStore.get().shoppingItems[id]
          const latest = dataStore.get().meds[med.id]
          if (replenished || !current?.checked || current.sourceMedicationId !== med.id || !latest || (latest.ownerId !== null && latest.ownerId !== viewer())) return
          replenished = true
          restock(med.id, amount)
        },
      },
    })
  }
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
