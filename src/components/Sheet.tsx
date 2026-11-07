import { X } from 'lucide-react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
  // fechada pelo gesto: a própria gaveta já deslizou para fora; a saída do Motion não anima de novo
  const [dragClosed, setDragClosed] = useState(false)
  const exit = { duration: reduce || dragClosed ? 0 : 0.17, ease: [0.65, 0, 0.35, 1] as const }
  const hidden = desktop ? 'translateY(16px) scale(0.98)' : 'translateY(100%)'
  const shown = desktop ? 'translateY(0px) scale(1)' : 'translateY(0%)'

  /*
   * Arrastar para baixo fecha (só no celular, onde é gaveta). Começa na faixa de cima e no título, não no
   * conteúdo (não briga com a rolagem). Só transform e opacity, direto no elemento (compositor, regra 6).
   */
  const overlayRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; y: number; t: number; v: number; dy: number } | null>(null)
  const setDrag = (dy: number) => {
    const panel = panelRef.current
    const overlay = overlayRef.current
    if (!panel || !overlay) return
    panel.style.transform = `translateY(${dy}px)`
    overlay.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, panel.offsetHeight)))
  }
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (desktop || !present || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    drag.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.v = (e.clientY - d.y) / Math.max(1, now - d.t)
    d.y = e.clientY
    d.t = now
    d.dy = Math.max(0, e.clientY - d.y0) // só para baixo
    setDrag(d.dy)
  }
  const onDragEnd = () => {
    const d = drag.current
    drag.current = null
    const panel = panelRef.current
    const overlay = overlayRef.current
    if (!d || !panel || !overlay || d.dy < 2) return
    const flick = d.v > 0.5 && d.dy > 24
    const far = d.dy > Math.min(160, panel.offsetHeight * 0.25)
    const duration = reduce ? 0 : 170
    if (flick || far) {
      setDragClosed(true)
      panel.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(100%)' }], { duration, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' })
      overlay
        .animate([{ opacity: overlay.style.opacity || '1' }, { opacity: 0 }], { duration, fill: 'forwards' })
        .finished.then(onClose, onClose)
      return
    }
    // não passou do ponto: volta para o lugar
    panel.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(0px)' }], { duration: reduce ? 0 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    overlay.animate([{ opacity: overlay.style.opacity || '1' }, { opacity: 1 }], { duration: reduce ? 0 : 180 })
    panel.style.transform = shown
    overlay.style.opacity = '1'
  }

  return (
    <div
      className={cx('fixed inset-0 flex items-end justify-center lg:items-center', present ? 'z-50' : 'pointer-events-none z-40')}
      data-testid={present ? testId : undefined}
      inert={!present}
      aria-hidden={present ? undefined : true}
    >
      <motion.div
        ref={overlayRef}
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
        {/* área de arrastar: faixa com a alça (centralizada na gaveta) + título; o X continua tocável */}
        <div
          className="cursor-grab touch-none select-none active:cursor-grabbing lg:cursor-auto lg:touch-auto lg:select-auto"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          data-testid="sheet-grab"
        >
          <div aria-hidden className="flex justify-center pt-2.5 pb-1 lg:hidden">
            <span className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 pt-1 pb-2 lg:px-6 lg:pt-5">
            <div className="min-w-0 pt-2">
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
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 lg:px-6">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-5 pt-3 pb-4 lg:px-6">{footer}</div> : null}
      </motion.div>
    </div>
  )
}
