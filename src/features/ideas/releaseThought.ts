import type { AiProvider } from '../../ai/provider'
import { deletePendingCapture, undoOrganization } from '../../store/ideaActions'
import { describeAiResult, guessPlace, queueOrganize } from '../../store/ideaAi'
import { ui } from '../../store/ui'

interface Hooks {
  /** "Parece ser de Saúde": chega depois, quando a IA local acha o lugar */
  onPlace?: (place: string) => void
  /** Desfazer sem IA: devolve o texto ao campo */
  restoreText?: () => void
  /** Botão "Ver" do aviso depois que a IA organizou */
  view?: () => void
}

/**
 * Depois de guardar um pensamento: com IA, organiza por trás (um por vez, ADR-0012) e avisa com Desfazer;
 * sem IA, avisa que ficou na Caixa de entrada. Compartilhado pelo campo das Ideias e pela barra do PC.
 */
export function afterCapture(captureId: string, thought: string, provider: AiProvider | null, hooks: Hooks = {}): void {
  if (!provider) {
    ui.toast('Guardado na Caixa de entrada. Organize quando quiser.', {
      undo: () => {
        const r = deletePendingCapture(captureId)
        if (r.ok) hooks.restoreText?.()
      },
    })
    return
  }
  void guessPlace(thought).then((place) => { if (place) hooks.onPlace?.(place) })
  queueOrganize(captureId, provider)
    .then((r) => ui.toast(describeAiResult(r), { undo: () => { undoOrganization(r.logId) }, ...(hooks.view ? { action: { label: 'Ver', onClick: hooks.view } } : {}) }))
    .catch((e: unknown) => ui.toast(`${e instanceof Error ? e.message : 'A IA não respondeu.'} Está guardado, e eu organizo quando a IA voltar.`, { tone: 'warn' }))
}
