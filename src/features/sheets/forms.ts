import type { SheetKind } from '../../store/ui'

/**
 * Formulários das gavetas. O botão de salvar mora no rodapé fixo do <Sheet> (fora da área de rolagem)
 * e aponta para o formulário pelo atributo `form`: rodapé sólido, sem conteúdo vazando por baixo.
 */
export const SHEET_FORM = {
  quickCapture: 'sheet-form-quick-capture',
  unstuck: 'sheet-form-unstuck',
  task: 'sheet-form-task',
  expense: 'sheet-form-expense',
  newMed: 'sheet-form-new-med',
  routine: 'sheet-form-routine',
  event: 'sheet-form-event',
  period: 'sheet-form-period',
  cycleSetup: 'sheet-form-cycle-setup',
  specialDate: 'sheet-form-special-date',
  gift: 'sheet-form-gift',
  goal: 'sheet-form-goal',
  pay: 'sheet-form-pay',
  rule: 'sheet-form-rule',
  idea: 'sheet-form-idea',
  organizeIdea: 'sheet-form-organize-idea',
  concretize: 'sheet-form-concretize',
  askIdeas: 'sheet-form-ask-ideas',
} as const satisfies Partial<Record<SheetKind, string>>

export const SHEET_SUBMIT: Partial<Record<SheetKind, { label: string; testId: string }>> = {
  quickCapture: { label: 'Salvar agora', testId: 'quick-save' },
  unstuck: { label: 'Continuar', testId: 'unstuck-next' },
  task: { label: 'Salvar tarefa', testId: 'task-save' },
  expense: { label: 'Salvar gasto', testId: 'expense-save' },
  newMed: { label: 'Salvar remédio', testId: 'new-med-save' },
  routine: { label: 'Salvar rotina', testId: 'routine-save' },
  event: { label: 'Salvar compromisso', testId: 'event-save' },
  period: { label: 'Salvar registro', testId: 'period-save' },
  cycleSetup: { label: 'Salvar durações', testId: 'cycle-setup-save' },
  specialDate: { label: 'Salvar data', testId: 'special-save' },
  gift: { label: 'Guardar ideia', testId: 'gift-save' },
  goal: { label: 'Salvar caixinha', testId: 'goal-save' },
  pay: { label: 'Dar baixa', testId: 'pay-save' },
  rule: { label: 'Salvar conta fixa', testId: 'rule-save' },
  idea: { label: 'Salvar ideia', testId: 'idea-save' },
  organizeIdea: { label: 'Guardar aqui', testId: 'organize-save' },
  concretize: { label: 'Criar e ligar à ideia', testId: 'concretize-save' },
  askIdeas: { label: 'Perguntar', testId: 'ask-submit' },
}
