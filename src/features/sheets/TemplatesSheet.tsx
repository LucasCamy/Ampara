import { CircleCheck, Lightbulb, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button, cx, Segmented, StatusBadge } from '../../components/ui'
import { MAX_COMFORT } from '../../domain/mood'
import { planTemplate, TEMPLATES, type IdeaTemplate, type TemplateGroup } from '../../domain/templates'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { applyTemplate } from '../../store/templateActions'
import { ui, uiStore, useUi } from '../../store/ui'

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const GROUPS: { value: TemplateGroup; label: string; shortLabel?: string; testId: string }[] = [
  { value: 'routines', label: 'Rotinas', testId: 'templates-routines' },
  { value: 'comfort', label: 'Kit de calma', shortLabel: 'Meu kit', testId: 'templates-comfort' },
  { value: 'shopping', label: 'Compras', testId: 'templates-shopping' },
]

function Preview({ template }: { template: IdeaTemplate }) {
  if (template.group === 'routines') {
    return template.entries.map((entry) => <p key={entry.title} className="mt-2 text-[13px] text-muted">{entry.weekdays.length ? entry.weekdays.map((day) => WEEK[day]).join(', ') : 'Todos os dias'} · <span className="font-data">{entry.times.join(', ')}</span> · para você</p>)
  }
  const entries = template.group === 'comfort' ? template.entries : template.entries.map((entry) => entry.title)
  return <ul className="mt-3 flex flex-col gap-1 text-[14px] text-ink">{entries.map((entry) => <li key={entry} className="flex items-start gap-2"><span aria-hidden className="text-action">·</span><span className="min-w-0 break-words">{entry}</span></li>)}</ul>
}

export function TemplatesSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer, me } = usePeople()
  const state = useData((data) => data)
  const shoppingEnabled = me.enabledModules?.shopping !== false
  const [group, setGroup] = useState<TemplateGroup>(() => params.group === 'comfort' || (params.group === 'shopping' && shoppingEnabled) ? params.group : 'routines')
  const [undoToastId, setUndoToastId] = useState<number | null>(null)
  const undoToast = useUi((data) => data.toasts.find((toast) => toast.id === undoToastId))
  const activeGroup = group === 'shopping' && !shoppingEnabled ? 'routines' : group
  const templates = TEMPLATES.filter((template) => template.group === activeGroup)
  return (
    <div className="pt-1 pb-2" data-testid="templates-library">
      <p className="mb-4 flex items-start gap-2 text-[14px] text-muted"><Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0 text-action" />Escolha uma ideia por vez. Ela entra na hora e você pode desfazer.</p>
      <Segmented<TemplateGroup> label="Tipos de ideias" value={activeGroup} onChange={setGroup} stretch size="sm" options={GROUPS.filter((option) => option.value !== 'shopping' || shoppingEnabled)} />
      {undoToast?.undo ? <Button type="button" variant="quiet" icon={Undo2} className="mt-3 w-full" data-testid="templates-undo" onClick={() => { undoToast.undo?.(); ui.dismissToast(undoToast.id) }}>Desfazer última ideia</Button> : null}
      {activeGroup === 'routines' ? <p className="mt-3 text-[13px] text-muted">Os horários são um começo. Depois, ajuste cada rotina em Cuidados.</p> : null}
      <div className="mt-4 flex flex-col gap-3">
        {templates.map((template) => {
          const plan = planTemplate(template, state, viewer)
          const canApply = plan.entries.length > 0 && !plan.disabled
          const complete = !canApply && plan.limited === 0 && !plan.disabled
          return (
            <section key={template.id} className={cx('rounded-[20px] p-4', complete ? 'ledger-solid' : 'ledger-dashed')} aria-labelledby={`idea-${template.id}`} data-testid="template-card">
              <h3 id={`idea-${template.id}`} className="text-[16px] font-bold text-ink">{template.title}</h3>
              <p className="mt-1 text-[14px] text-muted">{template.description}</p>
              <Preview template={template} />
              <StatusBadge kind={complete ? 'ok' : 'pending'} className="mt-3">{complete ? 'Já está no seu espaço' : plan.limited ? 'Seu kit está cheio' : plan.skipped ? 'Adicionar o que falta' : 'Pronta para começar'}</StatusBadge>
              {plan.limited ? <p className="mt-2 text-[13px] text-muted">Seu kit tem espaço para <span className="font-data">{MAX_COMFORT} itens</span>. Tire uma ideia que já não ajuda para guardar outra.</p> : null}
              <Button type="button" variant={canApply ? 'primary' : 'quiet'} icon={canApply ? Plus : CircleCheck} disabled={!canApply} className="mt-3 w-full" data-testid={`template-${template.id}`} onClick={() => { if (applyTemplate(template.id) > 0) setUndoToastId(uiStore.get().toasts.at(-1)?.id ?? null) }}>
                {canApply ? (plan.skipped ? 'Adicionar o que falta' : 'Usar esta ideia') : plan.limited ? 'Kit cheio' : 'Ideia já guardada'}
              </Button>
            </section>
          )
        })}
      </div>
      <Button type="button" variant="ghost" className="mt-4 w-full" onClick={onDone}>Pronto</Button>
    </div>
  )
}
