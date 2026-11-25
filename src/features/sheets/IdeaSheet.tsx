import { CalendarDays, Check, CircleCheck, CircleDashed, Link2, ListTodo, Rocket, X } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { Button, ChoiceChips, cx, FieldError, Segmented, StatusBadge, TextField } from '../../components/ui'
import type { IdeaNature, IdeaState } from '../../domain/ideas'
import { IDEA_LIMITS } from '../../domain/ideas'
import { LINK_LABEL, actionsOf, linksOf, notesOf } from '../../domain/ideasView'
import { useData } from '../../store/data'
import { ui } from '../../store/ui'
import { markIdeaReviewed, moveNote, setLinkState, updateIdea } from '../../store/ideaActions'
import { usePeople } from '../../store/hooks'
import { IdeaStateBadge, NATURE_OPTIONS, shortDateTime, toastResult, useIdeaData } from '../ideas/ideaUi'
import { SHEET_FORM } from './forms'

type EditableState = Exclude<IdeaState, 'VIROU_ACAO'>

/** Cartão da ideia: nome, tipo, estado, assunto, resumo, linha do tempo das anotações e ligações. */
export function IdeaSheet({ id, onDone }: { id: string; onDone: () => void }) {
  const { viewer } = usePeople()
  const data = useIdeaData()
  const idea = data.ideas[id]!
  const uid = useId()
  const [title, setTitle] = useState(idea.title)
  const [nature, setNature] = useState<IdeaNature>(idea.nature)
  const [state, setState] = useState<IdeaState>(idea.state)
  const [topicId, setTopicId] = useState(idea.topicId)
  const [summary, setSummary] = useState(idea.summary)
  const [error, setError] = useState<string | null>(null)

  const notes = useMemo(() => notesOf(data, viewer, id), [data, viewer, id])
  const otherIdeas = useMemo(() => Object.values(data.ideas)
    .filter((i) => i.ownerId === viewer && i.id !== id)
    .map((i) => ({ id: i.id, label: `${data.ideaTopics[i.topicId]?.name ?? ''} › ${i.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [data, viewer, id])
  const links = useMemo(() => linksOf(data, viewer, id), [data, viewer, id])
  const areas = useMemo(
    () => Object.values(data.ideaAreas).filter((a) => a.ownerId === viewer && !a.hidden).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.ideaAreas, viewer],
  )
  const topics = Object.values(data.ideaTopics).filter((t) => t.ownerId === viewer && !t.archived)
  const needsReview = idea.needsReview || notes.some((n) => n.needsReview)
  const ideaActions = useData((s) => s.ideaActions)
  const tasks = useData((s) => s.tasks)
  const events = useData((s) => s.events)
  const actions = useMemo(() => actionsOf({ ideaActions, tasks, events }, viewer, id), [ideaActions, tasks, events, viewer, id])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = updateIdea(id, { title, summary, nature, topicId, ...(state !== 'VIROU_ACAO' ? { state: state as EditableState } : {}) })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toastResult(result, 'Ideia salva')
    onDone()
  }

  return (
    <form id={SHEET_FORM.idea} onSubmit={submit} noValidate className="flex flex-col gap-5 pt-2" data-testid="idea-form">
      {needsReview ? (
        <div className="ledger-dashed flex flex-col gap-2 rounded-[20px] p-4">
          <StatusBadge kind="pending">Para conferir</StatusBadge>
          <p className="text-[14px] text-ink">A IA encaixou parte disto com dúvida. Se estiver no lugar certo, confirme.</p>
          <Button type="button" variant="secondary" icon={Check} onClick={() => toastResult(markIdeaReviewed(id), 'Conferido')}>Está certo</Button>
        </div>
      ) : null}

      <section aria-labelledby={`${uid}-acao`} className="flex flex-col gap-2">
        <h3 id={`${uid}-acao`} className="sr-only">Virar ação</h3>
        {actions.length ? (
          <ul className="flex flex-col gap-2" data-testid="idea-actions">
            {actions.map(({ action, title: t, done, when }) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => ui.openSheet(action.targetType === 'TASK' ? 'task' : 'event', { id: action.targetId })}
                  className="press hoverable flex w-full items-center gap-3 rounded-[16px] border border-line p-3 text-left"
                >
                  {action.targetType === 'TASK' ? <ListTodo size={18} aria-hidden className="shrink-0 text-action" /> : <CalendarDays size={18} aria-hidden className="shrink-0 text-action" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-muted">Virou {action.targetType === 'TASK' ? 'tarefa' : 'compromisso'}{when ? <> · <span className="font-data">{when}</span></> : null}</span>
                    <span className="block text-[15px] font-semibold break-words text-ink">{t}</span>
                  </span>
                  {done ? <CircleCheck size={18} aria-label="Concluída" className="shrink-0 text-ok" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button type="button" variant={actions.length ? 'secondary' : 'primary'} icon={Rocket} onClick={() => ui.openSheet('concretize', { ideaId: id })} data-testid="idea-concretize">
          {actions.length ? 'Criar outra ação' : 'Isso vai acontecer'}
        </Button>
      </section>

      <TextField label="Nome da ideia" value={title} onChange={(v) => { setTitle(v); setError(null) }} maxLength={80} error={error ?? undefined} />

      <ChoiceChips<IdeaNature> label="Que tipo de pensamento é" value={nature} onChange={setNature} options={NATURE_OPTIONS} cols={2} />

      {state === 'VIROU_ACAO' ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Estado</span>
          <IdeaStateBadge state="VIROU_ACAO" />
        </div>
      ) : (
        <Segmented<EditableState>
          label="Estado"
          hideLabel={false}
          value={state as EditableState}
          onChange={setState}
          fill
          options={[
            { value: 'SOLTA', label: 'Solta', testId: 'idea-state-solta' },
            { value: 'AMADURECENDO', label: 'Amadurecendo', shortLabel: 'Amadurecendo', testId: 'idea-state-amadurecendo' },
            { value: 'GUARDADA', label: 'Guardada', testId: 'idea-state-guardada' },
          ]}
        />
      )}

      <div>
        <label htmlFor={`${uid}-topic`} className="mb-2 block text-[14px] font-semibold text-ink">Assunto</label>
        <select
          id={`${uid}-topic`}
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="min-h-12 w-full rounded-[14px] border border-line-strong bg-bg px-3 text-[16px] text-ink"
          data-testid="idea-topic"
        >
          {areas.map((a) => {
            const inArea = topics.filter((t) => t.areaId === a.id).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
            return inArea.length ? (
              <optgroup key={a.id} label={a.name}>
                {inArea.map((t) => <option key={t.id} value={t.id}>{t.name}{t.firm ? '' : ' (provisório)'}</option>)}
              </optgroup>
            ) : null
          })}
        </select>
      </div>

      <div>
        <label htmlFor={`${uid}-summary`} className="mb-2 block text-[14px] font-semibold text-ink">Resumo <span className="font-normal text-muted">(opcional, até 2 frases)</span></label>
        <textarea
          id={`${uid}-summary`}
          rows={2}
          maxLength={IDEA_LIMITS.summaryMaxChars}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full resize-y rounded-[16px] border border-line-strong bg-bg px-4 py-3 text-[16px] leading-relaxed text-ink"
        />
      </div>

      <section aria-labelledby={`${uid}-notes`} className="flex flex-col gap-2">
        <h3 id={`${uid}-notes`} className="text-[15px] font-bold text-ink">O que você já disse sobre isso</h3>
        {notes.length ? (
          <ol className="flex flex-col gap-2" data-testid="idea-notes">
            {notes.map((n) => (
              <li key={n.id} className={cx('rounded-[16px] p-3', n.needsReview ? 'ledger-dashed' : 'border border-line')}>
                <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">{n.text}</p>
                <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <span className="font-data">{shortDateTime(n.createdAt)}</span>
                  {n.needsReview ? <span className="inline-flex items-center gap-1 font-semibold text-warn"><CircleDashed size={14} aria-hidden />A IA teve dúvida</span> : null}
                </p>
                {otherIdeas.length ? (
                  <>
                    <label htmlFor={`${uid}-move-${n.id}`} className="sr-only">Mover esta anotação para outra ideia</label>
                    <select
                      id={`${uid}-move-${n.id}`}
                      value=""
                      onChange={(e) => { if (e.target.value) toastResult(moveNote(n.id, e.target.value), 'Anotação movida. A IA aprende com isso.') }}
                      className="mt-2 min-h-11 w-full rounded-[12px] border border-line bg-bg px-3 text-[15px] text-ink"
                      data-testid="idea-note-move"
                    >
                      <option value="">Mover para outra ideia…</option>
                      {otherIdeas.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        ) : <p className="text-[14px] text-muted">Nenhuma anotação ainda.</p>}
      </section>

      <section aria-labelledby={`${uid}-links`} className="flex flex-col gap-2">
        <h3 id={`${uid}-links`} className="text-[15px] font-bold text-ink">Ligações com outras ideias</h3>
        {links.length ? (
          <ul className="flex flex-col gap-2" data-testid="idea-links">
            {links.map(({ link, other, outgoing }) => (
              <li key={link.id} className={cx('flex flex-col gap-2 rounded-[16px] p-3', link.state === 'SUGERIDA' ? 'ledger-dashed' : 'border border-line')}>
                <p className="flex items-start gap-2 text-[15px] text-ink">
                  <Link2 size={17} aria-hidden className="mt-0.5 shrink-0 text-couple" />
                  <span className="min-w-0 break-words">
                    {outgoing ? <>Esta ideia <strong>{LINK_LABEL[link.type]}</strong> {other.title}</> : <>{other.title} <strong>{LINK_LABEL[link.type]}</strong> esta ideia</>}
                  </span>
                </p>
                <p className="text-[13px] text-muted">{link.state === 'SUGERIDA' ? 'Sugestão: ' : ''}{link.reason}</p>
                {link.state === 'SUGERIDA' ? (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="secondary" icon={Check} onClick={() => toastResult(setLinkState(link.id, 'CONFIRMADA'), 'Ligação confirmada')}>Aceitar</Button>
                    <Button type="button" size="sm" variant="quiet" icon={X} onClick={() => toastResult(setLinkState(link.id, 'RECUSADA'), 'Ligação recusada')}>Recusar</Button>
                  </div>
                ) : (
                  <Button type="button" size="sm" variant="quiet" icon={X} className="self-start" onClick={() => toastResult(setLinkState(link.id, 'RECUSADA'), 'Ligação removida')}>Remover ligação</Button>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-[14px] text-muted">Nenhuma ligação. Quando a IA perceber uma conexão, ela sugere aqui.</p>}
      </section>
      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  )
}
