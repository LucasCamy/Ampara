import { useEffect, useId, useMemo, useState } from 'react'
import { useIsDesktop } from '../../components/Sheet'
import { Segmented, Title } from '../../components/ui'
import type { IdeaNature } from '../../domain/ideas'
import { IDEA_NATURES } from '../../domain/ideas'
import { buildIdeaTree, DEFAULT_FILTER, inboxOf, NATURE_LABEL, type IdeaFilter, type IdeaShow } from '../../domain/ideasView'
import { ensureIdeaAreas } from '../../store/ideaActions'
import { usePeople } from '../../store/hooks'
import { CaptureBox } from './CaptureBox'
import { useIdeaData } from './ideaUi'
import { InboxView } from './InboxView'
import { MapView } from './MapView'
import { OutlineView } from './OutlineView'

type View = 'esboco' | 'mapa' | 'caixa'

/** Ideias: soltar agora, ver com sentido depois (docs/08-ideias-segundo-cerebro.md). Só quem escreveu vê. */
export function IdeasScreen() {
  const { viewer } = usePeople()
  const desktop = useIsDesktop()
  const data = useIdeaData()
  const [view, setView] = useState<View | null>(null)
  const [filter, setFilter] = useState<IdeaFilter>(DEFAULT_FILTER)

  useEffect(() => ensureIdeaAreas(viewer), [viewer])

  const tree = useMemo(() => buildIdeaTree(data, viewer, filter), [data, viewer, filter])
  const inbox = useMemo(() => inboxOf(data, viewer), [data, viewer])
  // mapa por padrão em telas largas, esboço no celular
  const current: View = view ?? (desktop ? 'mapa' : 'esboco')

  return (
    <div className="flex flex-col gap-5" data-testid="ideas-screen">
      <Title anchor="Ideias," rest="soltas agora, com sentido depois." />
      <CaptureBox />
      <Segmented<View>
        label="Como ver suas ideias"
        value={current}
        onChange={setView}
        stretch
        options={[
          { value: 'esboco', label: 'Esboço', testId: 'ideas-view-esboco' },
          { value: 'mapa', label: 'Mapa', testId: 'ideas-view-mapa' },
          { value: 'caixa', label: `Caixa de entrada (${inbox.count})`, shortLabel: `Caixa (${inbox.count})`, testId: 'ideas-view-caixa', ariaLabel: `Caixa de entrada, ${inbox.count} ${inbox.count === 1 ? 'item' : 'itens'}` },
        ]}
      />
      {current !== 'caixa' ? <Filters filter={filter} onChange={setFilter} /> : null}
      {current === 'esboco' ? <OutlineView key={`${viewer}-${filter.show}-${filter.nature}`} tree={tree} /> : null}
      {current === 'mapa' ? <MapView tree={tree} data={data} owner={viewer} /> : null}
      {current === 'caixa' ? <InboxView inbox={inbox} /> : null}
    </div>
  )
}

function Filters({ filter, onChange }: { filter: IdeaFilter; onChange: (f: IdeaFilter) => void }) {
  const id = useId()
  const natures: (IdeaNature | 'TODAS')[] = ['TODAS', ...IDEA_NATURES]
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Segmented<IdeaShow>
          label="Quais ideias mostrar"
          value={filter.show}
          onChange={(show) => onChange({ ...filter, show })}
          size="sm"
          fill
          options={[
            { value: 'ATIVAS', label: 'Ativas', testId: 'ideas-show-ativas' },
            { value: 'GUARDADAS', label: 'Guardadas', testId: 'ideas-show-guardadas' },
            { value: 'TODAS', label: 'Todas', testId: 'ideas-show-todas' },
          ]}
        />
      </div>
      <div className="sm:w-[220px]">
        <label htmlFor={`${id}-nature`} className="sr-only">Tipo de ideia</label>
        <select
          id={`${id}-nature`}
          value={filter.nature}
          onChange={(e) => onChange({ ...filter, nature: e.target.value as IdeaNature | 'TODAS' })}
          className="min-h-11 w-full rounded-[14px] border border-line-strong bg-surface px-3 text-[16px] text-ink"
          data-testid="ideas-nature"
        >
          {natures.map((n) => <option key={n} value={n}>{n === 'TODAS' ? 'Todos os tipos' : NATURE_LABEL[n]}</option>)}
        </select>
      </div>
    </div>
  )
}
