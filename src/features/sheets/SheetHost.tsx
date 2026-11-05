import { useCallback } from 'react'
import { Sheet } from '../../components/Sheet'
import { ui, useUi } from '../../store/ui'
import { ExpenseSheet } from './ExpenseSheet'
import { MedSheet } from './MedSheet'
import { SosSheet } from './SosSheet'
import { TaskSheet } from './TaskSheet'

const TITLES = {
  task: { title: 'Nova tarefa rápida', description: 'Escreva, escolha para quem e salve. Menos de 3 segundos.' },
  expense: { title: 'Registrar gasto', description: 'Valor, para quem e pronto. Divisão já vem preenchida.' },
  med: { title: 'Confirmar remédio', description: 'Engoliu agora ou vai pegar água? A gente lembra.' },
  sos: { title: 'Pedir ajuda', description: 'Três toques. Sem precisar explicar tudo.' },
} as const

/** Assina só o uiStore.sheet: abrir gaveta não re-renderiza as telas de dados */
export function SheetHost() {
  const sheet = useUi((s) => s.sheet)
  const close = useCallback(() => ui.closeSheet(), [])
  const meta = sheet ? TITLES[sheet.kind] : null
  return (
    <Sheet open={!!sheet} onClose={close} title={meta?.title} description={meta?.description} testId={sheet ? `sheet-${sheet.kind}` : undefined}>
      {sheet?.kind === 'task' ? <TaskSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'expense' ? <ExpenseSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'med' ? <MedSheet onDone={close} /> : null}
      {sheet?.kind === 'sos' ? <SosSheet params={sheet.params} onDone={close} /> : null}
    </Sheet>
  )
}
