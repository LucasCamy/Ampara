import { RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button, SectionHeader } from '../../components/ui'
import { ui } from '../../store/ui'
import { applyUpdate, checkForUpdate, useUpdate } from '../../sync/update'

/** Aviso discreto no topo do conteúdo: versão nova publicada */
export function UpdateBanner() {
  const available = useUpdate((s) => s.available)
  const [busy, setBusy] = useState(false)
  if (!available) return null
  return (
    <div role="status" className="card ledger-dashed mb-4 flex flex-wrap items-center justify-between gap-3 p-3" data-testid="update-banner">
      <p className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
        <Sparkles size={18} aria-hidden className="shrink-0 text-action" /> Nova versão do Ampara disponível.
      </p>
      <Button
        size="sm"
        variant="primary"
        icon={RefreshCw}
        busy={busy}
        onClick={() => {
          setBusy(true)
          void applyUpdate()
        }}
        data-testid="update-apply"
      >
        Atualizar
      </Button>
    </div>
  )
}

/** Ajustes: versão atual e procurar atualização na hora */
export function AboutSection() {
  const { current, available, checking, lastCheckedAt } = useUpdate((s) => s)
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="sobre" data-testid="about-section">
      <SectionHeader id="sobre" title="Sobre este app" rest="· versão e atualização" />
      <p className="text-[14px] text-muted">
        Versão <span className="font-data text-ink" data-testid="app-version">{current}</span>
        {lastCheckedAt ? (
          <>
            {' '}
            · conferida às <span className="font-data">{new Date(lastCheckedAt).toTimeString().slice(0, 5)}</span>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-[13px] text-muted">O app confere sozinho ao abrir e ao voltar para ele. Atualizar não apaga nada: os dados ficam no aparelho.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {available ? (
          <Button variant="primary" icon={RefreshCw} onClick={() => void applyUpdate()} data-testid="about-apply">
            Atualizar agora
          </Button>
        ) : (
          <Button
            variant="secondary"
            icon={RefreshCw}
            busy={checking}
            onClick={async () => {
              const found = await checkForUpdate()
              if (!found) ui.toast('Você já está na versão mais nova', { tone: 'info' })
            }}
            data-testid="about-check"
          >
            Procurar atualização
          </Button>
        )}
      </div>
    </section>
  )
}
