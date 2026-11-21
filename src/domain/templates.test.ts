import { describe, expect, it } from 'vitest'
import { buildRoutine, validateRoutine } from './catalog'
import { MAX_COMFORT } from './mood'
import { buildEmpty } from './seed'
import { planTemplate, templateById, TEMPLATES, type IdeaTemplate } from './templates'
import type { ShoppingItem } from './types'

const now = new Date('2026-11-21T14:00:00Z')
const template = (id: string): IdeaTemplate => templateById(id)!
const routine = (id: string, name: string) => buildRoutine({ title: name, times: ['12:00'], weekdays: [], instruction: 'Meu horário', responsible: 'ME', stock: '', stockUnit: '' }, 'A', id, now.toISOString())
const item = (id: string, title: string, checked = false): ShoppingItem => ({ id, title, checked, addedBy: 'A', checkedBy: checked ? 'A' : null, category: 'MARKET', quantity: null, sourceMedicationId: null, createdAt: now.toISOString(), updatedAt: now.toISOString() })

describe('biblioteca de ideias', () => {
  it('oferece as cinco rotinas invisíveis com horários e dias válidos', () => {
    const routines = TEMPLATES.filter((entry) => entry.group === 'routines')
    expect(routines.map((entry) => entry.id)).toEqual(['routine-water', 'routine-keys', 'routine-bills', 'routine-stretch', 'routine-bedding'])
    expect(new Set(TEMPLATES.map((entry) => entry.id)).size).toBe(TEMPLATES.length)
    for (const model of routines) {
      for (const entry of model.entries) {
        expect(validateRoutine({ ...entry, times: [...entry.times], weekdays: [...entry.weekdays], responsible: 'ME', stock: '', stockUnit: '' })).toEqual({})
      }
    }
    expect(templateById('desconhecido')).toBeUndefined()
  })

  it('rotina minha ou da casa já existente é preservada mesmo com outro horário, acento e espaços', () => {
    const state = buildEmpty(now)
    state.meds.existing = routine('existing', ' BEBER   ÁGUA ')
    const previous = structuredClone(state)
    expect(planTemplate(template('routine-water'), state, 'A')).toMatchObject({ entries: [], skipped: 1 })
    state.meds.existing.assignee = null
    expect(planTemplate(template('routine-water'), state, 'B')).toMatchObject({ entries: [], skipped: 1 })
    expect(state.meds.existing.times).toEqual(previous.meds.existing!.times)
  })

  it('rotina atribuída ao par não impede o viewer de criar o próprio lembrete', () => {
    const state = buildEmpty(now)
    state.meds.existing = routine('existing', 'Beber água')
    expect(planTemplate(template('routine-water'), state, 'B')).toMatchObject({ skipped: 0, entries: [{ title: 'Beber água' }] })
  })

  it('kit usa só os itens do viewer para deduplicar e contar o limite', () => {
    const state = buildEmpty(now)
    state.comfortItems.par = { id: 'par', ownerId: 'A', text: 'Alguns minutos de silêncio, sem perguntas.', createdAt: '', updatedAt: '' }
    expect(planTemplate(template('comfort-silence'), state, 'B')).toMatchObject({ skipped: 0, entries: ['Alguns minutos de silêncio, sem perguntas.'] })
    state.comfortItems.meu = { id: 'meu', ownerId: 'B', text: 'ALGUNS MINUTOS DE SILENCIO, SEM PERGUNTAS.', createdAt: '', updatedAt: '' }
    expect(planTemplate(template('comfort-silence'), state, 'B')).toMatchObject({ entries: [], skipped: 1 })
  })

  it('ideia com vários itens respeita o espaço que falta no kit', () => {
    const state = buildEmpty(now)
    for (let index = 0; index < MAX_COMFORT - 1; index++) state.comfortItems[String(index)] = { id: String(index), ownerId: 'A', text: `Minha ideia ${index}`, createdAt: '', updatedAt: '' }
    expect(planTemplate(template('comfort-grounding'), state, 'A')).toMatchObject({ entries: ['Beber água devagar.'], limited: 1, skipped: 0 })
  })

  it('lista base acrescenta só compras abertas que faltam; itens já comprados podem voltar', () => {
    const state = buildEmpty(now)
    state.shoppingItems.arroz = item('arroz', ' ARROZ ')
    state.shoppingItems.feijao = item('feijao', 'Feijão', true)
    const plan = planTemplate(template('shopping-basics'), state, 'B')
    expect(plan).toMatchObject({ group: 'shopping', skipped: 1, disabled: false })
    if (plan.group !== 'shopping') throw new Error('Plano inesperado')
    expect(plan.entries.map((entry) => entry.title)).toEqual(['Feijão', 'Ovos', 'Leite', 'Frutas', 'Verduras'])
    expect(state.shoppingItems.feijao.checked).toBe(true)
  })

  it('módulo Compras desativado impede aplicar lista sem alterar a preferência', () => {
    const state = buildEmpty(now, 'SOLO')
    state.profiles.A!.enabledModules!.shopping = false
    const previous = structuredClone(state)
    expect(planTemplate(template('shopping-basics'), state, 'A')).toMatchObject({ entries: [], disabled: true })
    expect(state).toEqual(previous)
  })
})
