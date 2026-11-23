import { useCallback } from 'react'
import { Sheet } from '../../components/Sheet'
import { SearchX } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui'
import { useData } from '../../store/data'
import { useIsSolo } from '../../store/hooks'
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
import { PaySheet } from './PaySheet'
import { RuleSheet } from './RuleSheet'
import { TxSheet } from './TxSheet'
import { TourSheet } from './TourSheet'
import { SpecialDateSheet } from './SpecialDateSheet'
import { RoutineSheet } from './RoutineSheet'
import { SosSheet } from './SosSheet'
import { TaskSheet } from './TaskSheet'
import { QuickCaptureSheet } from './QuickCaptureSheet'
import { UnstuckSheet } from './UnstuckSheet'
import { TemplatesSheet } from './TemplatesSheet'
import { IdeaSheet } from './IdeaSheet'
import { OrganizeIdeaSheet } from './OrganizeIdeaSheet'
import { ConcretizeSheet } from './ConcretizeSheet'
import { AskIdeasSheet } from './AskIdeasSheet'

const TITLES: Record<SheetKind, { title: string; description: string }> = {
  quickCapture: { title: 'Captura livre', description: 'Escreva ou dite uma frase. Confira o que foi entendido antes de salvar.' },
  unstuck: { title: 'Travei', description: 'Um começo pequeno, sem cobrança.' },
  templates: { title: 'Ideias para começar', description: 'Escolha o que ajuda agora. Dá para desfazer.' },
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
  pay: { title: 'Dar baixa', description: 'Valor que saiu de verdade, quem pagou e quando.' },
  tx: { title: 'Lançamento', description: 'Baixa, desfazer ou excluir.' },
  rule: { title: 'Conta fixa', description: 'Vale deste mês em diante.' },
  tour: { title: 'Bem-vindo ao Ampara', description: 'Um minuto para conhecer. Dá para pular.' },
  idea: { title: 'Ideia', description: 'Só você vê. Ajuste, confira e veja como ela se liga às outras.' },
  organizeIdea: { title: 'Organizar pensamento', description: 'Escolha a área, o assunto e a ideia. Tudo pode mudar depois.' },
  concretize: { title: 'Isso vai acontecer', description: 'Confira e ajuste. Só é criado quando você confirmar.' },
  askIdeas: { title: 'Perguntar às minhas ideias', description: 'A resposta vem só do que você anotou. Nada é mudado.' },
}

const EDIT_TITLES: Partial<Record<SheetKind, { title: string; description: string }>> = {
  task: { title: 'Editar tarefa', description: 'Ajuste a tarefa ou escolha um primeiro passo pequeno.' },
  newMed: { title: 'Editar remédio', description: 'Mudou a dose ou o horário? Ajuste aqui. Doses já registradas ficam no histórico.' },
  routine: { title: 'Editar rotina', description: 'Qualquer um de vocês pode ajustar ou excluir.' },
  event: { title: 'Editar compromisso', description: 'Mudou o dia ou o horário? Ajuste aqui.' },
  period: { title: 'Corrigir registro', description: 'Ajuste as datas ou exclua. A previsão se recalcula sozinha.' },
  specialDate: { title: 'Editar data especial', description: 'Os dois veem e recebem o lembrete.' },
  gift: { title: 'Editar ideia', description: 'Só você vê.' },
  idea: { title: 'Ideia', description: 'Só você vê. Ajuste, confira e veja como ela se liga às outras.' },
  goal: { title: 'Editar caixinha', description: 'O valor guardado não muda aqui.' },
}

/** Assina o uiStore.sheet e, só em modo edição, se o item ainda existe (pode ter sido excluído no outro aparelho) */
export function SheetHost() {
  const isSolo = useIsSolo()
  const viewer = useUi((s) => s.viewer)
  const sheet = useUi((s) => s.sheet)
  const unstuckStep = useUi((s) => s.unstuckStep ?? 1)
  const close = useCallback(() => ui.closeSheet(), [])
  const editId = sheet?.params.id
  const exists = useData(
    (d) => !editId || (sheet?.kind === 'task' ? !!d.tasks[editId] : sheet?.kind === 'event' ? !!d.events[editId] : sheet?.kind === 'period' ? !!d.cycleLogs[editId] : sheet?.kind === 'specialDate' ? !!d.specialDates[editId] : sheet?.kind === 'gift' ? !!d.giftIdeas[editId] : sheet?.kind === 'goal' ? !!d.savingsGoals[editId] : sheet?.kind === 'pay' || sheet?.kind === 'tx' ? !!d.transactions[editId] : sheet?.kind === 'rule' ? !!d.recurrences[editId] : sheet?.kind === 'idea' ? !!d.ideas[editId] && d.ideas[editId].ownerId === viewer : !!d.meds[editId]),
  )
  const editing = !!editId
  const soloMeta: Partial<typeof TITLES> = {
    task: { title: 'Nova tarefa rápida', description: 'Escreva e salve. Se ajudar, comece com um passo pequeno.' },
    expense: { title: 'Registrar gasto', description: 'Valor e descrição para cuidar do seu mês.' },
    sos: { title: 'Travei', description: 'Um passo pequeno, sem cobrança.' },
    routine: { title: 'Nova rotina', description: 'As pequenas coisas que ajudam no seu dia.' },
    goal: { title: 'Nova caixinha', description: 'Guarde aos poucos para um objetivo seu.' },
  }
  const meta = sheet ? ((editing && EDIT_TITLES[sheet.kind]) || (isSolo && soloMeta[sheet.kind]) || TITLES[sheet.kind]) : null
  const isUnstuck = sheet?.kind === 'unstuck' || (isSolo && sheet?.kind === 'sos')
  const base = isUnstuck ? { label: unstuckStep === 3 ? 'Começar 5 min' : 'Continuar', testId: unstuckStep === 3 ? 'unstuck-start' : 'unstuck-next' } : sheet && exists ? SHEET_SUBMIT[sheet.kind] : undefined
  const submit = base && editing && sheet?.kind !== 'pay' ? { ...base, label: 'Salvar alterações' } : base
  const formId = isUnstuck ? SHEET_FORM.unstuck : sheet && sheet.kind in SHEET_FORM ? SHEET_FORM[sheet.kind as keyof typeof SHEET_FORM] : undefined
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
      {sheet?.kind === 'task' && exists ? <TaskSheet key={editId ?? 'new'} params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'quickCapture' ? <QuickCaptureSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'expense' ? <ExpenseSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'med' ? <MedSheet onDone={close} /> : null}
      {sheet?.kind === 'sos' ? (isSolo ? <UnstuckSheet params={sheet.params} onDone={close} /> : <SosSheet params={sheet.params} onDone={close} />) : null}
      {sheet?.kind === 'unstuck' ? <UnstuckSheet params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'templates' ? <TemplatesSheet params={sheet.params} onDone={close} /> : null}
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
      {sheet?.kind === 'tour' ? <TourSheet onDone={close} /> : null}
      {sheet?.kind === 'pay' && exists && editId ? <PaySheet key={editId} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'tx' && exists && editId ? <TxSheet id={editId} onDone={close} /> : null}
      {sheet?.kind === 'rule' && exists ? <RuleSheet key={editId ?? 'new'} id={editId} params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'goal' && exists ? <GoalSheet key={editId ?? 'new'} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'idea' && exists && editId ? <IdeaSheet key={editId} id={editId} onDone={close} /> : null}
      {sheet?.kind === 'askIdeas' ? <AskIdeasSheet /> : null}
      {sheet?.kind === 'concretize' && sheet.params.ideaId ? <ConcretizeSheet key={sheet.params.ideaId} ideaId={sheet.params.ideaId} onDone={close} /> : null}
      {sheet?.kind === 'organizeIdea' ? <OrganizeIdeaSheet key={sheet.params.captureId ?? sheet.params.noteId} params={sheet.params} onDone={close} /> : null}
      {sheet?.kind === 'gift' && exists ? <GiftSheet key={editId ?? 'new'} id={editId} params={sheet.params} onDone={close} /> : null}
    </Sheet>
  )
}
