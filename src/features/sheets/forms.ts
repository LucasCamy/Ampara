import type { SheetKind } from '../../store/ui'

/**
 * Formulários das gavetas. O botão de salvar mora no rodapé fixo do <Sheet> (fora da área de rolagem)
 * e aponta para o formulário pelo atributo `form`: rodapé sólido, sem conteúdo vazando por baixo.
 */
export const SHEET_FORM = {
  task: 'sheet-form-task',
  expense: 'sheet-form-expense',
  newMed: 'sheet-form-new-med',
  routine: 'sheet-form-routine',
  event: 'sheet-form-event',
  period: 'sheet-form-period',
  cycleSetup: 'sheet-form-cycle-setup',
  specialDate: 'sheet-form-special-date',
  gift: 'sheet-form-gift',
} as const satisfies Partial<Record<SheetKind, string>>

export const SHEET_SUBMIT: Partial<Record<SheetKind, { label: string; testId: string }>> = {
  task: { label: 'Salvar tarefa', testId: 'task-save' },
  expense: { label: 'Salvar gasto', testId: 'expense-save' },
  newMed: { label: 'Salvar remédio', testId: 'new-med-save' },
  routine: { label: 'Salvar rotina', testId: 'routine-save' },
  event: { label: 'Salvar compromisso', testId: 'event-save' },
  period: { label: 'Salvar registro', testId: 'period-save' },
  cycleSetup: { label: 'Salvar durações', testId: 'cycle-setup-save' },
  specialDate: { label: 'Salvar data', testId: 'special-save' },
  gift: { label: 'Guardar ideia', testId: 'gift-save' },
}
