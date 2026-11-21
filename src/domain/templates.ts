import { MAX_COMFORT } from './mood'
import type { DataState, PartnerId, ShopCategory } from './types'

export type TemplateGroup = 'routines' | 'comfort' | 'shopping'

export interface RoutineIdea {
  title: string
  times: readonly string[]
  weekdays: readonly number[]
  instruction: string
}

export interface ShoppingIdea {
  title: string
  category: ShopCategory
  quantity: string | null
}

interface IdeaInfo {
  id: string
  title: string
  description: string
}

export type IdeaTemplate = IdeaInfo & (
  | { group: 'routines'; entries: readonly RoutineIdea[] }
  | { group: 'comfort'; entries: readonly string[] }
  | { group: 'shopping'; entries: readonly ShoppingIdea[] }
)

/** Ideias editáveis, sem medicamentos prontos nem mudança automática de módulos. */
export const TEMPLATES: readonly IdeaTemplate[] = [
  { id: 'routine-water', group: 'routines', title: 'Beber água', description: 'Uma lembrança pequena no meio da manhã.', entries: [{ title: 'Beber água', times: ['10:00'], weekdays: [], instruction: 'Deixar um copo de água por perto.' }] },
  { id: 'routine-keys', group: 'routines', title: 'Chave e carteira antes de sair', description: 'Conferir o essencial antes de cruzar a porta.', entries: [{ title: 'Conferir chave e carteira antes de sair', times: ['08:00'], weekdays: [1, 2, 3, 4, 5], instruction: 'Tocar na chave e na carteira antes de sair.' }] },
  { id: 'routine-bills', group: 'routines', title: 'Revisar contas da semana', description: 'Olhar o que vence, sem resolver o mês inteiro.', entries: [{ title: 'Revisar contas da semana', times: ['18:00'], weekdays: [0], instruction: 'Conferir os vencimentos da próxima semana.' }] },
  { id: 'routine-stretch', group: 'routines', title: 'Alongar um pouco', description: 'Cinco minutos para mexer o corpo no seu ritmo.', entries: [{ title: 'Alongar 5 min', times: ['16:00'], weekdays: [], instruction: 'Separar cinco minutos para se alongar.' }] },
  { id: 'routine-bedding', group: 'routines', title: 'Trocar roupa de cama', description: 'Um lembrete semanal para uma tarefa fácil de esquecer.', entries: [{ title: 'Trocar roupa de cama', times: ['10:00'], weekdays: [6], instruction: 'Separar a roupa limpa antes de começar.' }] },
  { id: 'comfort-silence', group: 'comfort', title: 'Um pouco de silêncio', description: 'Uma ideia simples para diminuir as demandas.', entries: ['Alguns minutos de silêncio, sem perguntas.'] },
  { id: 'comfort-grounding', group: 'comfort', title: 'Voltar ao básico', description: 'Pequenas coisas que você pode experimentar e ajustar.', entries: ['Beber água devagar.', 'Sentar em um lugar confortável.'] },
  { id: 'comfort-music', group: 'comfort', title: 'Um som conhecido', description: 'Guardar algo familiar para um dia difícil.', entries: ['Ouvir uma música que eu já conheço.'] },
  { id: 'shopping-basics', group: 'shopping', title: 'Lista base da semana', description: 'Um começo para adaptar ao que você costuma comprar.', entries: [
    { title: 'Arroz', category: 'MARKET', quantity: null }, { title: 'Feijão', category: 'MARKET', quantity: null },
    { title: 'Ovos', category: 'MARKET', quantity: null }, { title: 'Leite', category: 'MARKET', quantity: null },
    { title: 'Frutas', category: 'MARKET', quantity: null }, { title: 'Verduras', category: 'MARKET', quantity: null },
  ] },
  { id: 'shopping-home', group: 'shopping', title: 'Básicos para casa', description: 'Lembrar de conferir os itens de uso diário.', entries: [
    { title: 'Detergente', category: 'HOME', quantity: null }, { title: 'Sabão para roupas', category: 'HOME', quantity: null }, { title: 'Papel higiênico', category: 'HOME', quantity: null },
  ] },
]

export const templateById = (id: string): IdeaTemplate | undefined => TEMPLATES.find((template) => template.id === id)
export const templateTextKey = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')

interface PlanInfo {
  skipped: number
  limited: number
  disabled: boolean
}
export type TemplatePlan = PlanInfo & (
  | { group: 'routines'; entries: RoutineIdea[] }
  | { group: 'comfort'; entries: string[] }
  | { group: 'shopping'; entries: ShoppingIdea[] }
)

/** Planeja apenas o que falta. O kit é pessoal; compras e rotinas sem responsável são compartilhadas. */
export function planTemplate(template: IdeaTemplate, state: DataState, viewer: PartnerId): TemplatePlan {
  if (template.group === 'routines') {
    const existing = new Set(Object.values(state.meds).filter((med) => med.kind === 'ROUTINE' && med.ownerId === null && (med.assignee == null || med.assignee === viewer)).map((med) => templateTextKey(med.name)))
    const entries = template.entries.filter((entry) => !existing.has(templateTextKey(entry.title)))
    return { group: 'routines', entries, skipped: template.entries.length - entries.length, limited: 0, disabled: false }
  }
  if (template.group === 'comfort') {
    const mine = Object.values(state.comfortItems).filter((item) => item.ownerId === viewer)
    const existing = new Set(mine.map((item) => templateTextKey(item.text)))
    const missing = template.entries.filter((entry) => !existing.has(templateTextKey(entry)))
    const entries = missing.slice(0, Math.max(0, MAX_COMFORT - mine.length))
    return { group: 'comfort', entries, skipped: template.entries.length - missing.length, limited: missing.length - entries.length, disabled: false }
  }
  const existing = new Set(Object.values(state.shoppingItems).filter((item) => !item.checked).map((item) => templateTextKey(item.title)))
  const entries = template.entries.filter((entry) => !existing.has(templateTextKey(entry.title)))
  const disabled = state.profiles[viewer]?.enabledModules?.shopping === false
  return { group: 'shopping', entries: disabled ? [] : entries, skipped: template.entries.length - entries.length, limited: 0, disabled }
}
