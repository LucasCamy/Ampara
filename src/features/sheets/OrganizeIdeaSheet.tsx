import { FolderPlus, Lightbulb, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { ChoiceChips, FieldError, TextField } from '../../components/ui'
import type { IdeaNature } from '../../domain/ideas'
import { IDEA_LIMITS } from '../../domain/ideas'
import { organizeManually } from '../../store/ideaActions'
import { usePeople } from '../../store/hooks'
import { NATURE_OPTIONS, toastResult, useIdeaData } from '../ideas/ideaUi'
import { SHEET_FORM } from './forms'

const NEW = '__novo'

/** Organizar à mão: Área > Assunto (ou novo) > Ideia (ou nova). Sem IA, sem pressa. */
export function OrganizeIdeaSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer } = usePeople()
  const data = useIdeaData()
  const text = params.captureId ? data.ideaCaptures[params.captureId]?.text : params.noteId ? data.ideaNotes[params.noteId]?.text : undefined
  const areas = useMemo(
    () => Object.values(data.ideaAreas).filter((a) => a.ownerId === viewer && !a.hidden).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.ideaAreas, viewer],
  )
  const [areaId, setAreaId] = useState<string | null>(null)
  const [topicChoice, setTopicChoice] = useState<string | null>(null)
  const [topicName, setTopicName] = useState('')
  const [ideaChoice, setIdeaChoice] = useState<string | null>(null)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [nature, setNature] = useState<IdeaNature | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const topics = Object.values(data.ideaTopics)
    .filter((t) => t.ownerId === viewer && t.areaId === areaId && !t.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const ideas = topicChoice && topicChoice !== NEW
    ? Object.values(data.ideas).filter((i) => i.ownerId === viewer && i.topicId === topicChoice).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : []
  const newIdea = !topicChoice || topicChoice === NEW || ideaChoice === NEW || !ideas.length

  if (!text) return <p className="pt-2 pb-4 text-[15px] text-muted">Este pensamento já foi organizado.</p>

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!areaId) next.area = 'Escolha uma área.'
    if (!topicChoice) next.topic = 'Escolha um assunto ou crie um novo.'
    else if (topicChoice === NEW && !topicName.trim()) next.topicName = 'Dê um nome ao assunto.'
    if (newIdea) {
      if (!ideaTitle.trim()) next.ideaTitle = 'Dê um nome à ideia.'
      if (!nature) next.nature = 'Escolha o tipo de pensamento.'
    } else if (!ideaChoice) next.idea = 'Escolha uma ideia ou crie uma nova.'
    setErrors(next)
    if (Object.keys(next).length) return
    const result = organizeManually({
      ...(params.captureId ? { captureId: params.captureId } : { noteId: params.noteId }),
      areaId: areaId!,
      ...(topicChoice === NEW ? { newTopicName: topicName } : { topicId: topicChoice! }),
      ...(newIdea ? { newIdea: { title: ideaTitle, nature: nature! } } : { ideaId: ideaChoice! }),
    })
    if (!result.ok) {
      setErrors({ form: result.error })
      return
    }
    const area = areas.find((a) => a.id === areaId)
    toastResult(result, `Guardado em ${area?.name ?? 'Ideias'}`)
    onDone()
  }

  return (
    <form id={SHEET_FORM.organizeIdea} onSubmit={submit} noValidate className="flex flex-col gap-5 pt-2" data-testid="organize-form">
      <blockquote className="rounded-[18px] bg-subtle p-4 text-[16px] leading-relaxed break-words whitespace-pre-wrap text-ink">{text}</blockquote>

      <ChoiceChips<string>
        label="1. Em que área da vida?"
        value={areaId}
        onChange={(v) => { setAreaId(v); setTopicChoice(null); setIdeaChoice(null); setErrors({}) }}
        options={areas.map((a) => ({ value: a.id, label: a.name, testId: `organize-area-${a.id}` }))}
        cols={2}
        error={errors.area}
      />

      {areaId ? (
        <div className="flex flex-col gap-3">
          <ChoiceChips<string>
            label="2. Qual assunto?"
            value={topicChoice}
            onChange={(v) => { setTopicChoice(v); setIdeaChoice(null); setErrors({}) }}
            options={[
              ...topics.map((t) => ({ value: t.id, label: t.name, icon: Lightbulb, testId: `organize-topic-${t.id}` })),
              { value: NEW, label: 'Novo assunto', icon: FolderPlus, testId: 'organize-topic-new' },
            ]}
            cols={2}
            error={errors.topic}
          />
          {topicChoice === NEW ? (
            <TextField label="Nome do assunto" value={topicName} onChange={(v) => { setTopicName(v); setErrors({}) }} maxLength={IDEA_LIMITS.topicNameMaxChars} placeholder="Ex.: Viagem para o Sul" error={errors.topicName} />
          ) : null}
        </div>
      ) : null}

      {topicChoice ? (
        <div className="flex flex-col gap-3">
          {topicChoice !== NEW && ideas.length ? (
            <ChoiceChips<string>
              label="3. Em qual ideia?"
              value={ideaChoice}
              onChange={(v) => { setIdeaChoice(v); setErrors({}) }}
              options={[
                ...ideas.map((i) => ({ value: i.id, label: i.title, testId: `organize-idea-${i.id}` })),
                { value: NEW, label: 'Nova ideia', icon: Plus, testId: 'organize-idea-new' },
              ]}
              cols={1}
              error={errors.idea}
            />
          ) : null}
          {newIdea ? (
            <>
              <TextField label={topicChoice !== NEW && ideas.length ? 'Nome da nova ideia' : '3. Nome da ideia'} value={ideaTitle} onChange={(v) => { setIdeaTitle(v); setErrors({}) }} maxLength={80} placeholder="Ex.: Correr de manhã" error={errors.ideaTitle} />
              <ChoiceChips<IdeaNature> label="Que tipo de pensamento é" value={nature} onChange={(v) => { setNature(v); setErrors({}) }} options={NATURE_OPTIONS} cols={2} error={errors.nature} />
            </>
          ) : null}
        </div>
      ) : null}
      {errors.form ? <FieldError>{errors.form}</FieldError> : null}
    </form>
  )
}
