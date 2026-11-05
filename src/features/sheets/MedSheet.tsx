import { Pill, SkipForward, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DoseActions, DoseStatus } from '../../components/domain'
import { Button, ChoiceChips, cx, EmptyState } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { skipReasonLabel } from '../../domain/medication'
import { dosesFor, nextAction } from '../../domain/today'
import type { SkipReason } from '../../domain/types'
import { skipDoseAction } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'

export function MedSheet({ onDone }: { onDone: () => void }) {
  const now = useNow()
  const { viewer } = usePeople()
  const state = useData((s) => s)
  const today = toDateKey(now)
  const pending = useMemo(
    () => dosesFor(state, viewer, today, now).filter((d) => d.view !== 'TAKEN' && d.view !== 'SKIPPED'),
    [state, viewer, today, now],
  )
  const suggested = useMemo(() => {
    const n = nextAction(pending, [], [], now)
    return n.kind === 'dose' ? n.dose.log.id : pending[0]?.log.id
  }, [pending, now])
  const [selected, setSelected] = useState<string | undefined>(suggested)
  const [skipping, setSkipping] = useState(false)
  const current = pending.find((d) => d.log.id === selected) ?? pending.find((d) => d.log.id === suggested)

  if (!current) {
    return (
      <div className="pt-2 pb-4">
        <EmptyState icon={Sparkles} title="Tudo em dia por aqui." text="Nenhum remédio ou rotina pendente para você hoje." action={<Button onClick={onDone}>Fechar</Button>} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pt-2 pb-2">
      {pending.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold text-ink">Qual dose?</legend>
          <div className="flex flex-col gap-2" role="radiogroup">
            {pending.map((d) => {
              const active = d.log.id === current.log.id
              return (
                <button
                  key={d.log.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelected(d.log.id)
                    setSkipping(false)
                  }}
                  className={cx('press flex min-h-12 items-center gap-3 rounded-[14px] border px-3 text-left', active ? 'border-action bg-selected' : 'border-line hoverable')}
                >
                  <Pill size={18} aria-hidden className={active ? 'text-action' : 'text-muted'} />
                  <span className="font-data text-[14px] text-muted">{d.log.scheduledTime}</span>
                  <span className="flex-1 text-[15px] font-semibold text-ink">{d.med.name}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="rounded-[20px] border border-dashed border-warn p-4">
        <p className="text-[18px] font-bold text-ink">
          <span className="font-data">{current.log.scheduledTime}</span> · {current.med.name}
        </p>
        <p className="text-[14px] text-muted">{current.med.dosage}</p>
        <div className="mt-2">
          <DoseStatus dose={current} now={now} />
        </div>
      </div>

      <DoseActions dose={current} size="lg" onAfter={onDone} />

      {current.med.kind === 'MED' ? (
        skipping ? (
          <ChoiceChips<SkipReason>
            label="Por que pular? (opcional, 1 toque)"
            value={null}
            onChange={(r) => {
              skipDoseAction(current.med.id, current.log.scheduledDate, current.log.scheduledTime, r)
              onDone()
            }}
            options={(['FORGOT', 'OUT_OF_STOCK', 'MEDICAL'] as SkipReason[]).map((r) => ({ value: r, label: skipReasonLabel(r) }))}
          />
        ) : (
          <Button variant="ghost" icon={SkipForward} onClick={() => setSkipping(true)} className="self-start" data-testid="dose-skip">
            Pular dose de hoje
          </Button>
        )
      ) : null}
    </div>
  )
}
