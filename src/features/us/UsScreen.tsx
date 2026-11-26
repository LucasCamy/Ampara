import { CalendarHeart, HeartHandshake, ShoppingCart, Timer } from 'lucide-react'
import { Title } from '../../components/ui'
import { useIsSolo, usePeople } from '../../store/hooks'
import { DatesGiftsSection } from './DatesGiftsSection'
import { FocusSection } from './FocusSection'
import { ComfortSection } from './MoodSection'
import { ShoppingSection } from './ShoppingSection'

/** "Nós": o que é da casa e do casal */
export function UsScreen() {
  const isSolo = useIsSolo()
  const { me } = usePeople()
  const shopping = me.enabledModules?.shopping !== false
  const jumps = [
    ...(shopping ? [{ id: 'compras-title', label: 'Compras', icon: ShoppingCart }] : []),
    { id: 'junto-title', label: 'Foco', icon: Timer },
    { id: 'acalma-title', label: 'Calma', icon: HeartHandshake },
    { id: 'datas-title', label: 'Datas', icon: CalendarHeart },
  ]
  return (
    <div data-testid="us-screen">
      <div className="mb-5">
        <Title anchor={isSolo ? 'Seu espaço,' : 'Nós dois,'} rest={isSolo ? 'pequenas coisas que amparam seu dia.' : 'o que é da casa e do casal.'} />
      </div>
      {/* índice da tela: pula direto para o assunto, sem procurar rolando */}
      <nav aria-label="Ir para" className="mb-5 grid auto-cols-fr grid-flow-col gap-2 sm:max-w-[560px]">
        {jumps.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => document.getElementById(j.id)?.scrollIntoView({ block: 'start' })}
            className="press hoverable flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] border border-line bg-surface px-1 text-[13px] font-semibold text-ink"
          >
            <j.icon size={20} aria-hidden className="text-action" />
            {j.label}
          </button>
        ))}
      </nav>
      {/* computador: à esquerda o que se faz (comprar, focar); à direita o que se cuida (calma, datas, presentes) */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {shopping ? <ShoppingSection /> : null}
          <FocusSection />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ComfortSection />
          <DatesGiftsSection />
        </div>
      </div>
    </div>
  )
}
