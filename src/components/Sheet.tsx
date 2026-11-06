import { X } from 'lucide-react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './ui'

const mq = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 1024px)') : null
const subscribeMq = (cb: () => void) => {
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
export const useIsDesktop = () => useSyncExternalStore(subscribeMq, () => mq?.matches ?? false, () => false)

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Gaveta inferior no mobile, diálogo centralizado no desktop.
 * Anima só transform em string e opacity (WAAPI no compositor). Overlay sólido, sem backdrop-filter.
 */
interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  testId?: string
}

export function Sheet(props: SheetProps) {
  // cada abertura ganha identidade própria: reabrir durante a saída não reaproveita a gaveta que está saindo
  const count = useRef(0)
  const wasOpen = useRef(false)
  if (props.open && !wasOpen.current) count.current += 1
  wasOpen.current = props.open
  return createPortal(<AnimatePresence>{props.open ? <SheetFrame key={count.current} {...props} /> : null}</AnimatePresence>, document.body)
}

function SheetFrame({ onClose, title, description, children, footer, testId }: SheetProps) {
  const desktop = useIsDesktop()
  const reduce = useReducedMotion()
  const present = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!present) return
    const returnFocus = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      // não rouba o foco de quem já começou a digitar em outro campo da gaveta
      if (!panel || panel.contains(document.activeElement)) return
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]')
      ;(auto ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true })
    })
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        const first = items[0]
        const last = items[items.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      requestAnimationFrame(() => {
        // só devolve o foco se nenhuma outra gaveta assumiu
        if (!document.querySelector('[role=dialog][aria-modal=true]') && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
      })
    }
  }, [present, onClose])

  const enter = { duration: reduce ? 0 : 0.26, ease: [0.32, 0.72, 0, 1] as const }
  const exit = { duration: reduce ? 0 : 0.17, ease: [0.65, 0, 0.35, 1] as const }
  const hidden = desktop ? 'translateY(16px) scale(0.98)' : 'translateY(100%)'
  const shown = desktop ? 'translateY(0px) scale(1)' : 'translateY(0%)'

  return (
    <div
      className={cx('fixed inset-0 flex items-end justify-center lg:items-center', present ? 'z-50' : 'pointer-events-none z-40')}
      data-testid={present ? testId : undefined}
      inert={!present}
      aria-hidden={present ? undefined : true}
    >
      <motion.div
        className="absolute inset-0 bg-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: enter }}
        exit={{ opacity: 0, transition: exit }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal={present ? 'true' : undefined}
        aria-labelledby={present ? 'sheet-title' : undefined}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-line bg-surface shadow-float lg:max-h-[86dvh] lg:w-[560px] lg:rounded-[28px]"
        initial={{ transform: hidden, opacity: desktop ? 0 : 1 }}
        animate={{ transform: shown, opacity: 1, transition: enter }}
        exit={{ transform: hidden, opacity: desktop ? 0 : 1, transition: exit }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2 lg:px-6 lg:pt-5">
          <div className="min-w-0 pt-2">
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong lg:hidden" />
            <h2 id={present ? 'sheet-title' : undefined} className="text-[20px] leading-tight font-bold tracking-tight text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-[14px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press hoverable mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted"
            aria-label="Fechar"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 lg:px-6">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-5 pt-3 pb-4 lg:px-6">{footer}</div> : null}
      </motion.div>
    </div>
  )
}
