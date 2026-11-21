import { buildRoutine } from '../domain/catalog'
import { uuid } from '../domain/seed'
import { planTemplate, templateById } from '../domain/templates'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'

/** Cada modelo entra de uma vez. O mesmo Desfazer remove só o que esse toque criou. */
export function applyTemplate(id: string): number {
  const template = templateById(id)
  if (!template) return 0
  const viewer = uiStore.get().viewer
  const plan = planTemplate(template, dataStore.get(), viewer)
  if (plan.disabled) {
    ui.toast('Compras está desativado nos seus módulos.', { tone: 'info' })
    return 0
  }
  if (!plan.entries.length) {
    ui.toast(plan.limited ? 'Seu kit está cheio. Tire um item para guardar outra ideia.' : 'Essa ideia já está no seu espaço.', { tone: 'info' })
    return 0
  }
  const iso = new Date().toISOString()
  const undo = transact((tx) => {
    if (plan.group === 'routines') {
      for (const entry of plan.entries) {
        tx.put('meds', buildRoutine({ title: entry.title, times: [...entry.times], weekdays: [...entry.weekdays], instruction: entry.instruction, responsible: 'ME', stock: '', stockUnit: '' }, viewer, uuid(), iso))
      }
    } else if (plan.group === 'comfort') {
      for (const text of plan.entries) tx.put('comfortItems', { id: uuid(), ownerId: viewer, text, createdAt: iso, updatedAt: iso })
    } else {
      for (const entry of plan.entries) tx.put('shoppingItems', { id: uuid(), title: entry.title, category: entry.category, quantity: entry.quantity, addedBy: viewer, checked: false, checkedBy: null, sourceMedicationId: null, createdAt: iso, updatedAt: iso })
    }
  })
  const subject = plan.group === 'routines' ? 'Rotina criada' : plan.group === 'comfort' ? 'Ideia guardada no seu kit' : 'Lista de compras iniciada'
  ui.toast(`${subject} · ${template.title}`, { undo })
  return plan.entries.length
}
