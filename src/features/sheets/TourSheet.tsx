import { firstName } from '../../domain/format'
import { HeartPulse, ListPlus, Lock, Sun, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui'
import { usePeople } from '../../store/hooks'
import { uiStore } from '../../store/ui'

/**
 * Apresentação curta, uma vez por pessoa. A marca de "já vi" fica no aparelho, por pessoa, e não diz nada
 * além disso (nenhum dado do casal).
 */
const KEY = (who: string) => `ampara:tour:${who}`
export const tourSeen = (who: string) => {
  try {
    return localStorage.getItem(KEY(who)) === 'done'
  } catch {
    return true
  }
}
export const markTourSeen = (who: string) => {
  try {
    localStorage.setItem(KEY(who), 'done')
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

interface Step {
  icon: LucideIcon
  title: string
  text: (partner: string) => string
}

const STEPS: Step[] = [
  { icon: Sun, title: 'Hoje: uma coisa de cada vez', text: () => 'A próxima ação vem primeiro. O que é urgente fica no topo; o resto espera em "Para hoje", sem parede de avisos.' },
  { icon: ListPlus, title: 'Capturar em 1 toque', text: () => 'Lembrou de algo? Tarefa, gasto, remédio ou pedir ajuda ficam sempre à mão, na barra de baixo (no computador, na lateral).' },
  { icon: HeartPulse, title: 'Cuidados', text: (p) => `Remédios com confirmação em 2 passos, rotinas da casa, rede de apoio e o ciclo. Se um remédio atrasar, ${p} pode receber um aviso gentil, só se você ligar.` },
  { icon: Users, title: 'Nós', text: (p) => `Lista de compras que aparece na hora para ${p}, datas especiais, o que acalma cada um e "fazer junto" para tarefas chatas.` },
  { icon: Lock, title: 'Você decide o que é seu', text: (p) => `Seus gastos pessoais e o seu ciclo: você escolhe se ${p} vê. Ideias de presente nunca aparecem para ${p}. Tudo fica cifrado no aparelho.` },
]

export function TourSheet({ onDone }: { onDone: () => void }) {
  const { partner } = usePeople()
  const [i, setI] = useState(0)
  const step = STEPS[i]!
  const last = i === STEPS.length - 1
  const finish = () => {
    markTourSeen(uiStore.get().viewer)
    onDone()
  }
  const Icon = step.icon
  const pname = firstName(partner.displayName)
  return (
    <div className="flex flex-col gap-4 pt-2 pb-2" data-testid="tour" data-step={i + 1}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-subtle text-action">
        <Icon size={24} aria-hidden />
      </span>
      <div aria-live="polite">
        <p className="text-[13px] font-semibold text-muted">
          <span className="font-data">{i + 1}</span> de <span className="font-data">{STEPS.length}</span>
        </p>
        <h3 className="mt-1 text-[19px] font-bold text-ink">{step.title}</h3>
        <p className="mt-1 text-[15px] text-muted">{step.text(pname)}</p>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden>
        {STEPS.map((_, k) => (
          <span key={k} className={k === i ? 'h-1.5 w-5 rounded-full bg-action' : 'h-1.5 w-1.5 rounded-full bg-line-strong'} />
        ))}
      </div>
      <div className="flex gap-2 border-t border-line pt-4">
        <Button variant="primary" className="flex-1" onClick={() => (last ? finish() : setI(i + 1))} data-testid="tour-next">
          {last ? 'Começar' : 'Próximo'}
        </Button>
        {!last ? (
          <Button variant="ghost" className="flex-1" onClick={finish} data-testid="tour-skip">
            Pular
          </Button>
        ) : null}
      </div>
    </div>
  )
}
