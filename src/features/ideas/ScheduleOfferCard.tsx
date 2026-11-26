import { CalendarPlus, ListTodo, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui'
import type { ScheduleOffer } from '../../store/ideaAi'
import { whenLabel } from './barBridge'

/**
 * Marcar pelo campo de Ideias (ADR-0014): a mesma proposta da barra do PC, no celular e na web. Nada é criado
 * sem o clique em "Marcar". Enquanto a IA completa com as anotações, mostra só que está olhando.
 */
export function ScheduleOfferCard({ offer, onConfirm, onKeep }: { offer: ScheduleOffer | null; onConfirm: () => void; onKeep: () => void }) {
  if (!offer) {
    return (
      <section className="ledger-dashed rounded-[16px] p-3" aria-live="polite" data-testid="schedule-offer">
        <p className="text-[14px] text-muted">Vendo o que você já sabe sobre isso…</p>
      </section>
    )
  }
  const p = offer.proposal
  const isEvent = p.kind === 'EVENT'
  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-line-strong bg-surface p-3" aria-live="polite" aria-labelledby="schedule-offer-title" data-testid="schedule-offer">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-muted">
        {isEvent ? <CalendarPlus size={16} aria-hidden /> : <ListTodo size={16} aria-hidden />}
        {isEvent ? 'Marcar na agenda?' : 'Criar tarefa?'}
      </p>
      <h3 id="schedule-offer-title" className="text-[18px] leading-snug font-bold break-words text-ink" data-testid="schedule-title">{p.title}</h3>
      <p className="text-[15px] text-ink" data-testid="schedule-when">{whenLabel(offer)}</p>
      {p.location ? <p className="text-[15px] break-words text-ink" data-testid="schedule-location">{p.location}</p> : null}
      {p.notes ? <p className="text-[14px] break-words text-muted">{p.notes}</p> : null}
      {offer.sourceLabel && (p.location || p.notes) ? <p className="text-[13px] text-muted">Achei nas suas anotações: {offer.sourceLabel}</p> : null}
      {offer.conflicts.map((c) => (
        <p key={c} className="flex items-center gap-1.5 text-[14px] font-semibold text-warn"><TriangleAlert size={15} aria-hidden />Já tem nesse horário: {c}</p>
      ))}
      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Button variant="primary" className="flex-1" onClick={onConfirm} data-testid="schedule-confirm">{isEvent ? 'Marcar' : 'Criar tarefa'}</Button>
        <Button variant="secondary" className="flex-1" onClick={onKeep} data-testid="schedule-keep">Só guardar como ideia</Button>
      </div>
    </section>
  )
}
