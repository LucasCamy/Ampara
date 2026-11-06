import { CalendarClock, Layers } from 'lucide-react'
import { useMemo } from 'react'
import { addDays, relativeDayLabel, toDateKey } from '../../domain/dates'
import { packDay } from '../../domain/pillPack'
import type { Medication } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { useViewer } from '../../store/hooks'

function Day({ d, today }: { d: string; today: string }) {
  return <span className="font-data whitespace-nowrap">{relativeDayLabel(d, today)}</span>
}

/** "Comprimido 12 de 21 · pausa a partir de sáb, 22/11" ou "Pausa · dia 3 de 7 · cartela nova sex, 29/11" */
export function PackLine({ med }: { med: Medication }) {
  const today = toDateKey(useNow())
  if (!med.pack) return null
  if (today < med.pack.startDate) {
    return (
      <p className="mt-1 flex items-start gap-2 text-[13px] text-muted" data-testid="pack-line">
        <Layers size={15} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Cartela começa <Day d={med.pack.startDate} today={today} />
        </span>
      </p>
    )
  }
  const p = packDay(med.pack, today)
  return (
    <p className="mt-1 flex items-start gap-2 text-[13px] text-muted" data-testid="pack-line" data-pause={p.inPause}>
      <Layers size={15} aria-hidden className="mt-0.5 shrink-0" />
      {p.inPause ? (
        <span>
          <strong className="text-ink">Pausa</strong> · dia <span className="font-data">{p.day - med.pack.activeDays}</span> de{' '}
          <span className="font-data">{med.pack.pauseDays}</span> · cartela nova <Day d={p.nextPackStart} today={today} />
        </span>
      ) : (
        <span>
          Comprimido <span className="font-data font-semibold text-ink">{p.pill}</span> de <span className="font-data">{med.pack.activeDays}</span>
          {p.pauseStart ? (
            <>
              {' · '}pausa a partir de <Day d={p.pauseStart} today={today} />
            </>
          ) : (
            <>
              {' · '}cartela nova <Day d={p.nextPackStart} today={today} />
            </>
          )}
        </span>
      )}
    </p>
  )
}

/** Atraso de pílula: lembrete honesto sobre a janela, sem fingir orientação médica */
export const PACK_LATE_HINT = 'Atrasou? Em muitas pílulas combinadas até 12 h ainda conta. Confira a bula ou pergunte à sua médica.'

/** Cartões no Hoje: começo da pausa e véspera da cartela nova (só para a dona) */
export function PackTodayCards() {
  const today = toDateKey(useNow())
  const viewer = useViewer()
  const meds = useData((s) => s.meds)
  const items = useMemo(() => {
    const out: { id: string; text: string; testId: string }[] = []
    for (const m of Object.values(meds)) {
      if (!m.pack || m.ownerId !== viewer || today < m.pack.startDate) continue
      const p = packDay(m.pack, today)
      if (p.pauseStart === today) {
        out.push({ id: m.id, testId: 'pack-pause-start', text: `Hoje começa a pausa de ${m.name}: sem comprimido por ${m.pack.pauseDays} dias.` })
      } else if (p.inPause && p.nextPackStart === addDays(today, 1)) {
        out.push({ id: m.id, testId: 'pack-new-tomorrow', text: `Amanhã começa a cartela nova de ${m.name}. Já deixe separada.` })
      } else if (!p.inPause && p.day === 1 && m.pack.pauseDays > 0) {
        out.push({ id: m.id, testId: 'pack-new-today', text: `Cartela nova de ${m.name} começa hoje.` })
      }
    }
    return out
  }, [meds, viewer, today])
  return (
    <>
      {items.map((i) => (
        <section key={i.id} className="card ledger-dashed p-4" data-testid={i.testId}>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CalendarClock size={18} aria-hidden className="shrink-0 text-couple" /> {i.text}
          </p>
        </section>
      ))}
    </>
  )
}
