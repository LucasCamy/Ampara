import { cx } from './ui'

/**
 * Esqueleto de carregamento com a forma do conteúdo final (título, seletor, cartões).
 * Pulsa só quando o sistema permite movimento (motion-safe); com movimento reduzido fica parado.
 */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cx('block rounded-[14px] bg-subtle motion-safe:animate-pulse', className)} />
}

/** Uma aba carregando: título bicolor, seletor e dois cartões, como as telas do app */
export function ScreenSkeleton({ label = 'Carregando' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="screen-skeleton">
      <span className="sr-only">{label}...</span>
      <Bone className="h-8 w-3/4 max-w-[420px] rounded-[12px]" />
      <Bone className="mt-5 h-[52px] w-full rounded-[16px] lg:max-w-[420px]" />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-3 p-4">
          <Bone className="h-5 w-1/2" />
          <Bone className="h-4 w-5/6" />
          <Bone className="h-12 w-full rounded-[16px]" />
        </div>
        <div className="card flex flex-col gap-3 p-4">
          <Bone className="h-5 w-2/5" />
          <Bone className="h-4 w-3/4" />
          <Bone className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  )
}
