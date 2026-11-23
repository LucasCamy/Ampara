import { ChevronRight, LocateFixed, Minus, Plus } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button, cx, Switch } from '../../components/ui'
import { areaLayout, meshEdges, skyLayout, wrapLabel, type AreaNode, type IdeaData, type MapLayout, type MapNode } from '../../domain/ideasView'
import type { PartnerId } from '../../domain/types'
import { ui } from '../../store/ui'

const SIZE = 640
const MIN_K = 0.6
const MAX_K = 2.6

/**
 * Mapa mental (ADR-0007): zoom por nível (Céu > Área), layout determinístico e malha como camada.
 * Pan arrastando e zoom pelos botões; só `transform` muda. O Esboço é a alternativa completa em lista.
 */
export function MapView({ tree, data, owner }: { tree: AreaNode[]; data: IdeaData; owner: PartnerId }) {
  const [areaId, setAreaId] = useState<string | null>(null)
  const [mesh, setMesh] = useState(true)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const area = areaId ? tree.find((a) => a.area.id === areaId) ?? null : null
  const layout: MapLayout = useMemo(() => (area ? areaLayout(area, SIZE) : skyLayout(tree, SIZE)), [area, tree])
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout])
  const links = useMemo(() => {
    if (!area || !mesh) return []
    const ids = new Set(layout.nodes.filter((n) => n.kind === 'idea').map((n) => n.id))
    return meshEdges(data, owner, ids)
  }, [area, mesh, layout, data, owner])

  const reset = () => setView({ k: 1, x: 0, y: 0 })
  const zoom = (factor: number) => setView((v) => {
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
    // aproxima mantendo o centro do desenho no lugar
    const c = SIZE / 2
    return { k, x: c - ((c - v.x) * k) / v.k, y: c - ((c - v.y) * k) / v.k }
  })
  const enterArea = (id: string | null) => {
    setAreaId(id)
    reset()
  }

  const scale = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect && rect.width ? SIZE / rect.width : 1
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) * scale()
    const dy = (e.clientY - d.py) * scale()
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
    d.moved = true
    setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }))
  }
  const onPointerUp = () => {
    // um clique depois de arrastar não abre nada
    window.setTimeout(() => { drag.current = null }, 0)
  }

  const activate = (n: MapNode) => {
    if (drag.current?.moved) return
    if (n.kind === 'area') enterArea(n.id)
    else if (n.kind === 'idea') ui.openSheet('idea', { id: n.id })
    else if (n.kind === 'center' && area) enterArea(null)
  }

  return (
    <div className="module flex flex-col gap-3 p-3 sm:p-4" data-testid="ideas-map">
      <nav aria-label="Onde você está no mapa" className="flex min-h-11 flex-wrap items-center gap-1 text-[14px] font-semibold">
        <button type="button" onClick={() => enterArea(null)} className={cx('press hoverable min-h-11 rounded-[12px] px-2', area ? 'text-action' : 'text-ink')} aria-current={area ? undefined : 'page'} data-testid="map-crumb-root">Todas as áreas</button>
        {area ? (
          <>
            <ChevronRight size={16} aria-hidden className="text-muted" />
            <span className="px-2 text-ink" aria-current="page">{area.area.name}</span>
          </>
        ) : null}
      </nav>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="group"
          aria-label={area ? `Mapa da área ${area.area.name}` : 'Mapa das suas áreas'}
          className="block aspect-square max-h-[70vh] w-full touch-none select-none rounded-[20px] bg-bg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            {layout.edges.map((e) => {
              const a = byId.get(e.from)
              const b = byId.get(e.to)
              return a && b ? <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-line-strong" strokeWidth={2} /> : null
            })}
            {links.map((l) => {
              const a = byId.get(l.fromIdeaId)
              const b = byId.get(l.toIdeaId)
              if (!a || !b) return null
              // curva puxada para o centro, para não sobrepor as linhas da árvore
              const mx = (a.x + b.x) / 2 + (SIZE / 2 - (a.x + b.x) / 2) * 0.35
              const my = (a.y + b.y) / 2 + (SIZE / 2 - (a.y + b.y) / 2) * 0.35
              return (
                <path
                  key={l.id}
                  d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  fill="none"
                  className="stroke-couple"
                  strokeWidth={2.5}
                  strokeDasharray={l.state === 'SUGERIDA' ? '7 6' : undefined}
                  data-testid={`map-link-${l.id}`}
                />
              )
            })}
            {layout.nodes.map((n) => <Node key={n.id} node={n} onActivate={() => activate(n)} />)}
          </g>
        </svg>
        <div className="absolute right-2 bottom-2 flex gap-1">
          <IconButton label="Aproximar" onClick={() => zoom(1.25)}><Plus size={18} aria-hidden /></IconButton>
          <IconButton label="Afastar" onClick={() => zoom(0.8)}><Minus size={18} aria-hidden /></IconButton>
          <IconButton label="Centralizar" onClick={reset}><LocateFixed size={18} aria-hidden /></IconButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {area ? <Switch checked={mesh} onChange={setMesh} label="Mostrar ligações" description="Sólida: você confirmou. Tracejada: sugestão." testId="map-mesh" /> : (
          <p className="text-[14px] text-muted">Toque numa área para ver os assuntos e as ideias. Arraste para mover.</p>
        )}
        {area ? <Button size="sm" variant="secondary" onClick={() => enterArea(null)}>Voltar para todas as áreas</Button> : null}
      </div>
      <Legend />
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="press hoverable grid size-11 place-items-center rounded-[14px] border border-line bg-surface text-ink">
      {children}
    </button>
  )
}

function Node({ node: n, onActivate }: { node: MapNode; onActivate: () => void }) {
  const lines = wrapLabel(n.label, n.kind === 'idea' ? 16 : 14)
  const font = n.kind === 'center' ? 17 : n.kind === 'area' ? 15 : n.kind === 'topic' ? 14 : 13
  const lh = font * 1.2
  const interactive = n.kind !== 'topic' && !(n.kind === 'center' && n.id === 'center')
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate()
    }
  }
  const countText = n.kind === 'area' || n.kind === 'center' ? `${n.count} ${n.count === 1 ? 'ideia' : 'ideias'}` : n.kind === 'topic' ? `${n.count}` : ''
  const label = n.kind === 'idea' ? `Ideia ${n.label}` : n.kind === 'topic' ? `Assunto ${n.label}, ${n.count} ideias` : `${n.label}, ${countText}`

  if (n.kind === 'idea' || n.kind === 'topic') {
    const w = Math.max(...lines.map((l) => l.length), 3) * font * 0.58 + 22
    const h = lines.length * lh + 14
    return (
      <g
        role={interactive ? 'button' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        aria-label={label}
        onClick={interactive ? onActivate : undefined}
        onKeyDown={interactive ? onKey : undefined}
        className={cx(interactive && 'cursor-pointer focus:outline-none [&:focus-visible>rect]:stroke-focus')}
        data-testid={`map-node-${n.id}`}
      >
        <rect
          x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={h / 2}
          className={n.kind === 'topic' ? 'fill-selected stroke-action' : n.state === 'GUARDADA' ? 'fill-subtle stroke-line-strong' : 'fill-surface stroke-line-strong'}
          strokeWidth={n.kind === 'topic' ? 2 : 1.5}
          strokeDasharray={n.dashed ? '6 5' : undefined}
        />
        {lines.map((line, i) => (
          <text key={i} x={n.x} y={n.y - ((lines.length - 1) * lh) / 2 + i * lh} textAnchor="middle" dominantBaseline="central" fontSize={font} className={cx('fill-ink', n.kind === 'topic' && 'font-bold')}>{line}</text>
        ))}
      </g>
    )
  }
  return (
    <g
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={interactive ? onKey : undefined}
      className={cx(interactive && 'cursor-pointer focus:outline-none [&:focus-visible>circle]:stroke-focus')}
      data-testid={`map-node-${n.id}`}
    >
      <circle cx={n.x} cy={n.y} r={n.r} className={n.kind === 'center' ? 'fill-action' : 'fill-surface stroke-action'} strokeWidth={2.5} strokeDasharray={n.dashed ? '6 5' : undefined} />
      {lines.map((line, i) => (
        <text key={i} x={n.x} y={n.y - ((lines.length - 1) * lh) / 2 + i * lh - (countText ? 8 : 0)} textAnchor="middle" dominantBaseline="central" fontSize={font} className={cx('font-bold', n.kind === 'center' ? 'fill-on-action' : 'fill-ink')}>{line}</text>
      ))}
      {countText ? (
        <text x={n.x} y={n.y + ((lines.length - 1) * lh) / 2 + 12} textAnchor="middle" dominantBaseline="central" fontSize={12} className={cx('font-data', n.kind === 'center' ? 'fill-on-action' : 'fill-muted')}>{countText}</text>
      ) : null}
    </g>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Legenda do mapa">
      <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0 w-6 border-t-2 border-dashed border-line-strong" />Tracejado: provisório ou para conferir</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0 w-6 border-t-2 border-solid border-couple" />Ligação entre ideias</li>
    </ul>
  )
}
