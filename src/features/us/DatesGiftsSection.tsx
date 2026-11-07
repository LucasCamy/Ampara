import { Cake, Gift, Heart, Lock, PartyPopper, Plus, ShoppingBag, Star, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button, cx, EditButton, EmptyState, SectionHeader, StatusBadge } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { datesToRemind, describeUpcoming, giftsFor, upcomingDates, whenLabel, type UpcomingDate } from '../../domain/specialDates'
import type { GiftIdea, SpecialDateKind } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { setGiftStatus } from '../../store/specialActions'
import { ui } from '../../store/ui'

const KIND_ICON: Record<SpecialDateKind, LucideIcon> = { ANNIVERSARY: Heart, BIRTHDAY: Cake, OTHER: Star }

function Day({ d }: { d: string }) {
  return (
    <span className="font-data whitespace-nowrap">
      {d.slice(8, 10)}/{d.slice(5, 7)}
    </span>
  )
}

function usePersonName() {
  const { viewer, profiles } = usePeople()
  return (u: UpcomingDate) => (u.item.personId ? (u.item.personId === viewer ? 'você' : profiles[u.item.personId].displayName.split(' ')[0]!) : undefined)
}

export function DatesGiftsSection() {
  const today = toDateKey(useNow())
  const { viewer } = usePeople()
  const dates = useData((s) => s.specialDates)
  const allGifts = useData((s) => s.giftIdeas)
  const nameOf = usePersonName()
  const upcoming = useMemo(() => upcomingDates(Object.values(dates), today), [dates, today])
  // privacidade: só as ideias de quem está usando (src/domain/specialDates.ts)
  const gifts = useMemo(() => giftsFor(Object.values(allGifts), viewer), [allGifts, viewer])
  const titleOf = (id: string | null) => (id ? dates[id]?.title : undefined)

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="datas-title" data-testid="dates-section">
        <SectionHeader
          id="datas-title"
          title="Datas especiais"
          rest="· lembrete 1 semana antes"
          action={
            <Button size="sm" variant="quiet" icon={Plus} onClick={() => ui.openSheet('specialDate')} data-testid="special-add">
              Nova data
            </Button>
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState icon={Heart} title="Nenhuma data ainda." text="Aniversário de namoro, aniversários de vocês, primeiro encontro. O app lembra uma semana antes." />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((u) => {
              const Icon = KIND_ICON[u.item.kind]
              const soon = u.inDays <= 7
              return (
                <li key={u.item.id} className={cx('card flex items-center gap-3 p-3', soon ? 'ledger-solid' : 'ledger-dashed')} data-testid="special-row" data-soon={soon}>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-couple">
                    <Icon size={20} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold break-words text-ink">{describeUpcoming(u, nameOf(u))}</p>
                    <p className="text-[13px] text-muted">
                      <Day d={u.on} /> · {whenLabel(u.inDays)}
                    </p>
                  </div>
                  <EditButton label={`Editar ${u.item.title}`} onClick={() => ui.openSheet('specialDate', { id: u.item.id })} testId="special-edit" />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="presentes-title" data-testid="gifts-section">
        <SectionHeader
          id="presentes-title"
          title="Ideias de presente"
          rest="· só você vê"
          action={
            <Button size="sm" variant="quiet" icon={Plus} onClick={() => ui.openSheet('gift')} data-testid="gift-add">
              Anotar ideia
            </Button>
          }
        />
        {gifts.length === 0 ? (
          <EmptyState icon={Gift} title="Nenhuma ideia guardada." text="Ouviu “queria tanto aquilo”? Anote na hora. Fica escondido do seu par." />
        ) : (
          <ul className="flex flex-col gap-2">
            {gifts.map((g) => (
              <GiftRow key={g.id} gift={g} dateTitle={titleOf(g.specialDateId)} />
            ))}
          </ul>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
          <Lock size={14} aria-hidden /> Cifrado e guardado só na sua conta.
        </p>
      </section>
    </div>
  )
}

function GiftRow({ gift, dateTitle }: { gift: GiftIdea; dateTitle?: string }) {
  return (
    <li className={cx('card p-3', gift.status === 'IDEA' ? 'ledger-dashed' : 'ledger-solid')} data-testid="gift-row" data-status={gift.status}>
      <div className="-mt-1 -mr-1 flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1">
          <p className={cx('text-[15px] font-bold break-words text-ink', gift.status === 'GIVEN' && 'text-muted line-through decoration-1')}>{gift.title}</p>
          {gift.note ? <p className="text-[13px] break-words text-muted">{gift.note}</p> : null}
          {dateTitle ? <p className="mt-0.5 text-[12px] font-semibold text-couple">Para: {dateTitle}</p> : null}
        </div>
        <EditButton label={`Editar ideia ${gift.title}`} onClick={() => ui.openSheet('gift', { id: gift.id })} testId="gift-edit" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {gift.status === 'IDEA' ? (
          <Button
            size="sm"
            variant="quiet"
            icon={ShoppingBag}
            className="grow basis-[130px]"
            data-testid="gift-bought"
            onClick={() => {
              setGiftStatus(gift.id, 'BOUGHT')
              // o gasto já vai como pessoal + presente (escondido do par na aba de finanças)
              ui.openSheet('expense', { title: gift.title, scope: 'PERSONAL', gift: '1' })
            }}
          >
            Comprei
          </Button>
        ) : null}
        {gift.status === 'BOUGHT' ? (
          <>
            <StatusBadge kind="ok">Comprado</StatusBadge>
            <Button size="sm" variant="quiet" icon={PartyPopper} className="grow basis-[130px]" onClick={() => setGiftStatus(gift.id, 'GIVEN')} data-testid="gift-given">
              Entreguei
            </Button>
          </>
        ) : null}
        {gift.status === 'GIVEN' ? <StatusBadge kind="ok">Entregue</StatusBadge> : null}
      </div>
    </li>
  )
}

/** Hoje: data chegando (os dois) + lembrete das ideias guardadas (só quem anotou) */
export function SpecialDatesTodayCards() {
  const today = toDateKey(useNow())
  const { viewer } = usePeople()
  const dates = useData((s) => s.specialDates)
  const allGifts = useData((s) => s.giftIdeas)
  const nameOf = usePersonName()
  const soon = useMemo(() => datesToRemind(Object.values(dates), today), [dates, today])
  const ideas = useMemo(() => giftsFor(Object.values(allGifts), viewer).filter((g) => g.status === 'IDEA'), [allGifts, viewer])
  return (
    <>
      {soon.map((u) => {
        // aniversário da própria pessoa: sem cobrança de presente
        const mine = u.item.personId === viewer
        const forThis = ideas.filter((g) => g.specialDateId === u.item.id).length
        return (
          <section key={u.item.id} className="module ledger-dashed p-4 sm:p-5" data-testid="special-today" aria-label={u.item.title}>
            <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
              <Heart size={16} aria-hidden /> {u.inDays === 0 ? 'É hoje' : `Faltam ${u.inDays} ${u.inDays === 1 ? 'dia' : 'dias'}`}
            </p>
            <p className="mt-2 text-[16px] font-semibold text-ink">
              {describeUpcoming(u, nameOf(u))} · <Day d={u.on} />
            </p>
            {!mine ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-[14px] text-muted">
                  {forThis ? `Você tem ${forThis === 1 ? '1 ideia guardada' : `${forThis} ideias guardadas`} para essa data.` : 'Ainda sem ideia de presente?'}
                </p>
                <Button size="sm" variant="quiet" icon={Gift} className="w-full sm:w-auto" onClick={() => (forThis ? ui.setTab('nos') : ui.openSheet('gift', { dateId: u.item.id }))} data-testid="special-today-gift">
                  {forThis ? 'Ver ideias' : 'Anotar ideia'}
                </Button>
              </div>
            ) : null}
          </section>
        )
      })}
    </>
  )
}
