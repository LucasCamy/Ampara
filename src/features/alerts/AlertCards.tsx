import { BellOff, Droplet, HandHeart, HeartHandshake, House, Pill, SquareX, X, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { AlertActionId, AlertCandidate, AlertCategory } from '../../domain/alerts'
import { CATEGORY } from '../../domain/alerts'
import { dismissAlert, type ShownAlert } from '../../store/alerts'
import { cx } from '../../components/ui'
import { runAlertAction } from './actions'

/**
 * Visual de cada categoria (regra 3: ícone + texto + cor + traço).
 * Pendente (remédio, rede de apoio) usa borda tracejada; pedido de ajuda e atraso usam --state-err;
 * o que vem do par usa a cor do casal; casa e contas ficam neutras. Um único acento de ação.
 */
export const CATEGORY_UI: Record<AlertCategory, { icon: LucideIcon; tone: string; card: string }> = {
  med: { icon: Pill, tone: 'text-action', card: 'border-dashed border-action bg-surface' },
  help: { icon: HeartHandshake, tone: 'text-err', card: 'border-solid border-err bg-err-soft' },
  support: { icon: SquareX, tone: 'text-err', card: 'border-dashed border-err bg-surface' },
  partner: { icon: HandHeart, tone: 'text-couple', card: 'border-solid border-couple bg-surface' },
  home: { icon: House, tone: 'text-muted', card: 'border-solid border-line-strong bg-surface' },
}

const ACTION_LABEL: Record<AlertActionId, string> = {
  take: 'Já engoli',
  water: 'Pegando água',
  'help-take': 'Eu assumo',
  'help-together': 'Fazemos juntos',
  'nudge-seen': 'Recebi, obrigado',
  'focus-join': 'Entrar junto',
  'open-today': 'Ver no Hoje',
  'open-finance': 'Ver contas',
}

const label = (a: AlertCandidate, id: AlertActionId) => (id === 'take' && a.category === 'home' ? 'Feito' : ACTION_LABEL[id])

/** Exemplo de cada categoria para o botão "Ouvir" dos Ajustes */
export const ALERT_SAMPLE: Record<AlertCategory, AlertCandidate> = {
  med: { key: 's-med', category: 'med', sound: 'med', label: 'Remédio · exemplo', title: 'Hora do remédio', body: 'Já engoliu ou vai pegar água?', actions: [] },
  help: { key: 's-help', category: 'help', sound: 'help', label: 'Pedido de ajuda · exemplo', title: 'Seu par pediu ajuda', body: 'É assim que o pedido chega.', actions: [] },
  support: { key: 's-support', category: 'support', sound: 'support', label: 'Rede de apoio · exemplo', title: 'Remédio do par pendente', body: 'Um lembrete gentil ajuda.', actions: [] },
  partner: { key: 's-partner', category: 'partner', sound: 'partner', label: 'Do seu par · exemplo', title: 'Lembrete carinhoso', body: 'Recado, foco junto ou tarefa enviada.', actions: [] },
  home: { key: 's-home', category: 'home', sound: 'home', label: 'Casa e contas · exemplo', title: 'Conta vence hoje', body: 'Rotina da casa ou conta do casal.', actions: [] },
}

export const WATER_SAMPLE: AlertCandidate = { key: 's-water', category: 'med', sound: 'water', label: 'Remédio · exemplo', title: 'Pegou a água?', body: 'O aviso de 5 min depois.', actions: [] }

export function AlertCard({ alert }: { alert: ShownAlert }) {
  const reduce = useReducedMotion()
  const ui = CATEGORY_UI[alert.category]
  const Icon = alert.sound === 'water' ? Droplet : ui.icon
  const sticky = CATEGORY[alert.category].sticky
  return (
    <motion.section
      layout={false}
      role={alert.category === 'help' ? 'alert' : 'status'}
      aria-label={`${CATEGORY[alert.category].label}: ${alert.title}`}
      data-testid="alert"
      data-category={alert.category}
      initial={{ transform: 'translateY(-120%)', opacity: 0 }}
      animate={{ transform: 'translateY(0%)', opacity: 1, transition: { duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.17 } }}
      className={cx('pointer-events-auto w-full max-w-[520px] rounded-[20px] border-2 p-3 pl-3.5 text-ink shadow-float', ui.card)}
    >
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-subtle', ui.tone)}>
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex items-center gap-1.5 text-[13px] font-bold', ui.tone)}>
            <span className="font-data">{alert.label}</span>
            {!alert.loud ? (
              <span className="inline-flex items-center gap-1 font-semibold text-muted">
                <BellOff size={13} aria-hidden /> silêncio
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[16px] leading-snug font-bold text-ink">{alert.title}</p>
          {alert.body ? <p className="mt-0.5 text-[14px] leading-snug text-muted">{alert.body}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => dismissAlert(alert.id)}
          aria-label={sticky ? 'Fechar aviso (continua no Hoje)' : 'Fechar aviso'}
          className="press -mt-1 -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-muted"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {alert.actions.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2 pl-[52px]">
          {alert.actions.map((id, i) => (
            <button
              key={id}
              type="button"
              data-testid={`alert-action-${id}`}
              onClick={() => {
                runAlertAction(alert, id)
                dismissAlert(alert.id)
              }}
              className={cx(
                'press inline-flex min-h-11 grow basis-[120px] items-center justify-center rounded-[14px] px-3.5 text-[14px] font-bold',
                i === 0 ? 'btn-primary' : cx('border border-line-strong bg-surface text-ink hoverable', id === 'water' && 'border-dashed'),
              )}
            >
              {label(alert, id)}
            </button>
          ))}
        </div>
      ) : null}
    </motion.section>
  )
}
