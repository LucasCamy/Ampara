import { ChevronDown, ChevronRight, CircleDashed, Lightbulb, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { Button, cx, EmptyState } from '../../components/ui'
import type { AreaNode } from '../../domain/ideasView'
import { confirmTopic } from '../../store/ideaActions'
import { ui } from '../../store/ui'
import { IdeaStateBadge, NatureTag, toastResult } from './ideaUi'

/** Esboço: a mesma estrutura do mapa em lista recolhível (celular estreito, teclado e leitor de tela). */
export function OutlineView({ tree }: { tree: AreaNode[] }) {
  // aberto onde tem ideia (inclusive a que a IA acabou de criar), a não ser que a pessoa tenha fechado
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const total = tree.reduce((n, a) => n + a.ideaCount, 0)
  if (!total && tree.every((a) => !a.topics.length)) {
    return <EmptyState icon={Lightbulb} title="Nenhuma ideia organizada ainda." text="Solte um pensamento acima. Depois, organize pela Caixa de entrada." />
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="ideas-outline">
      {tree.map(({ area, topics, ideaCount }) => {
        const expanded = open[area.id] ?? ideaCount > 0
        return (
          <li key={area.id} className="module overflow-hidden">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [area.id]: !expanded }))}
              className="press hoverable flex min-h-14 w-full items-center gap-3 px-4 text-left"
              data-testid={`outline-area-${area.id}`}
            >
              {expanded ? <ChevronDown size={20} aria-hidden className="shrink-0 text-muted" /> : <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 text-[16px] font-bold text-ink">{area.name}</span>
              <span className="font-data shrink-0 text-[14px] text-muted">{ideaCount} {ideaCount === 1 ? 'ideia' : 'ideias'}</span>
            </button>
            {expanded ? (
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                {topics.length ? topics.map(({ topic, ideas }) => (
                  <section key={topic.id} aria-label={`Assunto ${topic.name}`} className={cx('rounded-[20px] p-3', topic.firm ? 'border border-line' : 'ledger-dashed')} data-testid={`outline-topic-${topic.id}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 text-[15px] font-bold break-words text-ink">{topic.name}</h3>
                      {!topic.firm ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-warn"><CircleDashed size={15} aria-hidden />Provisório</span>
                          <Button size="sm" variant="secondary" onClick={() => toastResult(confirmTopic(topic.id), `Assunto ${topic.name} confirmado`)}>Confirmar assunto</Button>
                        </>
                      ) : null}
                    </div>
                    {ideas.length ? (
                      <ul className="flex flex-col gap-2">
                        {ideas.map(({ idea, noteCount, needsReview }) => (
                          <li key={idea.id}>
                            <button
                              type="button"
                              onClick={() => ui.openSheet('idea', { id: idea.id })}
                              className={cx('press hoverable flex w-full flex-col gap-2 rounded-[16px] bg-surface p-3 text-left', needsReview ? 'ledger-dashed' : 'border border-line')}
                              data-testid={`idea-row-${idea.id}`}
                            >
                              <span className="text-[15px] font-semibold break-words text-ink">{idea.title}</span>
                              <span className="flex flex-wrap items-center gap-2">
                                <IdeaStateBadge state={idea.state} />
                                <NatureTag nature={idea.nature} />
                                <span className="inline-flex items-center gap-1 text-[13px] text-muted"><MessageSquareText size={15} aria-hidden /><span className="font-data">{noteCount}</span> {noteCount === 1 ? 'anotação' : 'anotações'}</span>
                                {needsReview ? <span className="text-[13px] font-semibold text-warn">A IA teve dúvida</span> : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[14px] text-muted">Nenhuma ideia aqui com este filtro.</p>}
                  </section>
                )) : <p className="text-[14px] text-muted">Nenhum assunto ainda nesta área.</p>}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
