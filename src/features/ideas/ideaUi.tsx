import { CircleHelp, CloudRain, Eye, ListChecks, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { StatusBadge, type StatusKind } from '../../components/ui'
import type { IdeaNature, IdeaState } from '../../domain/ideas'
import { IDEA_NATURES } from '../../domain/ideas'
import { NATURE_LABEL, STATE_LABEL, type IdeaData } from '../../domain/ideasView'
import type { ActionResult } from '../../store/ideaActions'
import { useData } from '../../store/data'
import { ui } from '../../store/ui'

export const NATURE_ICON: Record<IdeaNature, LucideIcon> = {
  PLANO: ListChecks,
  DESEJO: Sparkles,
  PREOCUPACAO: CloudRain,
  PERGUNTA: CircleHelp,
  OBSERVACAO: Eye,
  REFLEXAO: MessageCircle,
}

export const NATURE_OPTIONS = IDEA_NATURES.map((n) => ({ value: n, label: NATURE_LABEL[n], icon: NATURE_ICON[n], testId: `nature-${n}` }))

/** Estado = ícone + texto + cor + traço (mesma linguagem do resto do Ampara). */
const STATE_KIND: Record<IdeaState, StatusKind> = {
  SOLTA: 'pending',
  AMADURECENDO: 'snooze',
  VIROU_ACAO: 'ok',
  GUARDADA: 'skipped',
}

export function IdeaStateBadge({ state }: { state: IdeaState }) {
  return <StatusBadge kind={STATE_KIND[state]}>{STATE_LABEL[state]}</StatusBadge>
}

export function NatureTag({ nature }: { nature: IdeaNature }) {
  const Icon = NATURE_ICON[nature]
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-subtle px-2.5 text-[13px] font-semibold text-ink">
      <Icon size={15} aria-hidden className="shrink-0 text-muted" />
      {NATURE_LABEL[nature]}
    </span>
  )
}

/** Toast padrão das ações de Ideias: sucesso com Desfazer, erro explicado. Devolve se deu certo. */
export function toastResult(result: ActionResult, message: string): boolean {
  if (!result.ok) {
    ui.toast(result.error, { tone: 'warn' })
    return false
  }
  ui.toast(message, { undo: result.undo })
  return true
}

/** As coleções das Ideias, cada uma assinada separadamente. */
export function useIdeaData(): IdeaData {
  const ideaAreas = useData((s) => s.ideaAreas)
  const ideaTopics = useData((s) => s.ideaTopics)
  const ideas = useData((s) => s.ideas)
  const ideaCaptures = useData((s) => s.ideaCaptures)
  const ideaNotes = useData((s) => s.ideaNotes)
  const ideaLinks = useData((s) => s.ideaLinks)
  return useMemo(() => ({ ideaAreas, ideaTopics, ideas, ideaCaptures, ideaNotes, ideaLinks }), [ideaAreas, ideaTopics, ideas, ideaCaptures, ideaNotes, ideaLinks])
}

export const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
