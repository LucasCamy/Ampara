import { CircleCheck, Clock, Info, Undo2, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ui, useUi } from '../store/ui'
import { cx, MoneyText } from './ui'

/** Toast no topo com [Desfazer] por 5 s (ARQ-D). aria-live para leitores de tela. */
export function Toaster() {
  const toasts = useUi((s) => s.toasts)
  const reduce = useReducedMotion()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.tone === 'warn' ? Clock : t.tone === 'info' ? Info : CircleCheck
          return (
            <motion.div
              key={t.id}
              role="status"
              data-testid="toast"
              initial={{ transform: 'translateY(-120%)', opacity: 0 }}
              animate={{ transform: 'translateY(0%)', opacity: 1, transition: { duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.17 } }}
              className="pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-[18px] border border-line-strong bg-surface py-2 pr-2 pl-4 text-ink shadow-float"
            >
              <Icon size={18} aria-hidden className={cx('shrink-0', t.tone === 'warn' ? 'text-warn' : t.tone === 'info' ? 'text-muted' : 'text-ok')} />
              <p className="min-w-0 flex-1 text-[14px] leading-snug font-medium"><MoneyText>{t.message}</MoneyText></p>
              {t.undo ? (
                <button
                  type="button"
                  onClick={() => {
                    t.undo?.()
                    ui.dismissToast(t.id)
                  }}
                  className={cx('press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-bold text-action underline-offset-4 hover:underline')}
                >
                  <Undo2 size={16} aria-hidden />
                  Desfazer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => ui.dismissToast(t.id)}
                aria-label="Fechar aviso"
                className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
