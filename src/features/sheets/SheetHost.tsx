import { useCallback } from 'react'
import { Sheet } from '../../components/Sheet'
import { SearchX } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui'
import { useData } from '../../store/data'
import { ui, useUi, type SheetKind } from '../../store/ui'
import { EventSheet } from './EventSheet'
import { ExpenseSheet } from './ExpenseSheet'
import { SHEET_FORM, SHEET_SUBMIT } from './forms'
import { MedSheet } from './MedSheet'
import { NewMedSheet } from './NewMedSheet'
import { PeriodSheet } from './PeriodSheet'
import { CycleSetupSheet } from './CycleSetupSheet'
import { GiftSheet } from './GiftSheet'
import { GoalSheet } from './GoalSheet'
import { SpecialDateSheet } from './SpecialDateSheet'
import { RoutineSheet } from './RoutineSheet'
import { SosSheet } from './SosSheet'
import { TaskSheet } from './TaskSheet'

const TITLES: Record<SheetKind, { title: string; description: string }> = {
  task: { title: 'Nova tarefa rápida', description: 'Escreva, escolha para quem e salve. Menos de 3 segundos.' },
  expense: { title: 'Registrar gasto', description: 'Valor, para quem e pronto. Divisão já vem preenchida.' },
  med: { title: 'Confirmar remédio', description: 'Engoliu agora ou vai pegar água? A gente lembra.' },
  sos: { title: 'Pedir ajuda', description: 'Três toques. Sem precisar explicar tudo.' },
  newMed: { title: 'Novo remédio', description: 'Nome, dose e horário. O lembrete em dois estágios já vem pronto.' },
  routine: { title: 'Nova rotina da casa', description: 'Coisas que qualquer um pode confirmar: lixo, gato, plantas.' },
  event: { title: 'Novo compromisso', description: 'Com dia e horário. Aparece na linha do tempo e no calendário.' },
  period: { title: 'Menstruação começou', description: 'Só o primeiro dia já basta. O app calcula o resto.' },
  cycleSetup: { title: 'Duração do seu ciclo', description: 'Usada na previsão enquanto o histórico é curto.' },
  specialDate: { title: 'Nova data especial', description: 'Repete todo ano. O app lembra uma semana antes.' },
  gift: { title: 'Ideia de presente', description: 'Anote na hora que ouvir. Só você vê.' },
  goal: { title: 'Nova caixinha', description: 'Uma meta do casal. Os dois guardam e veem quanto falta.' },
}

const EDIT_TITLES: Partial<Record<SheetKind, { title: string; description: string }>> = {
  newMed: { title: 'Editar remédio', description: 'Mudou a dose ou o horário? Ajuste aqui. Doses já registradas ficam no histórico.' },
  routine: { title: 'Editar rotina', description: 'Qualquer um de vocês pode ajustar ou excluir.' },
  event: { title: 'Editar compromisso', description: 'Mudou o dia ou o horário? Ajuste aqui.' },
  period: { title: 'Corrigir registro', description: 'Ajuste as datas ou exclua. A previsão se recalcula sozinha.' },
  specialDate: { title: 'Editar data especial', description: 'Os dois veem e recebem o lembrete.' },
  gift: { title: 'Editar ideia', description: 'Só você vê.' },
  goal: { title: 'Editar caixinha', description: 'O valor guardado não muda aqui.' },
}

/** Assina o uiStore.sheet e, só em modo edição, se o item ainda existe (pode ter sido excluído no outro aparelho) */
export function SheetHost() {
  const sheet = useUi((s) => s.sheet)
  const close = useCallback(() => ui.closeSheet(), [])
  const editId = sheet?.params.id
  const exists = useData(
    (d) => !editId || (sheet?.kind === 'event' ? !!d.events[editId] : sheet?.kind === 'period' ? !!d.cycleLogs[editId] : sheet?.kind === 'specialDate' ? !!d.specialDates[editId] : sheet?.kind === 'gift' ? !!d.giftIdeas[editId] : sheet?.kind === 'goal' ? !!d.savingsGoals[editId] : !!d.meds[editId]),
  )
  const editing = !!editId
  const meta = sheet ? ((editing && EDIT_TITLES[sheet.kind]) || TITLES[sheet.kind]) : null
  const base = sheet && exists ? SHEET_SUBMIT[sheet.kind] : undefined
  const submit = base && editing ? { ...base, label: 'Salvar alterações' } : base
  const formId = sheet && sheet.kind in SHEET_FORM ? SHEET_FORM[sheet.kind as keyof typeof SHEET_FORM] : undefined
  return (
    <Sheet
      open={!!sheet}
      onClose={close}
      title={meta?.title}
      description={meta?.description}
      testId={sheet ? `sheet-${sheet.kind}` : undefined}
      footer={
        submit && formId ? (
          <Button
            // envia o formulário da PRÓPRIA gaveta: a que está saindo (reabrir em menos de 170 ms) tem o mesmo id
            // e o atributo form="" pegaria o primeiro do documento, que é o dela
            type="button"
            form={formId}
            onClick={(e) => e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLFormElement>(`form#${formId}`)?.requestSubmit()}
            variant="primary"
            size="lg"
            className="w-full"
            data-testid={submit.testId}
          >
            {submit.label}
          </Button>
        ) : undefined
      }
    >
      {sheet?.kind === 'task' ? <TaskSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'expense' ? <ExpenseSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'med' ? <MedSheet onDone={close} /> : null}
      {sheet?.kind === 'sos' ? <SosSheet params={sheet.params} onDone={close} /> : null}
      {sheet && !exists ? (
        <div className="pt-2 pb-4">
          <EmptyState icon={SearchX} title="Este item não existe mais." text="Ele foi excluído, talvez no outro aparelho." action={<Button onClick={close}>Fechar</Button>} />
        </div>
      ) : null}
      {sheet?.kind === 'newMed' && exists ? <NewMedSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'routine' && exists ? <RoutineSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'event' && exists ? <EventSheet key={editId ?? 'new'} params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'period' && exists ? <PeriodSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'cycleSetup' ? <CycleSetupSheet onDone={close} /> : null}
      {sheet?.kind === 'specialDate' && exists ? <SpecialDateSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'goal' && exists ? <GoalSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'gift' && exists ? <GiftSheet key={editId ?? 'new'} id={editId} params={sheet.params} onDone={close} /> : null}
    </Sheet>
  )
}
