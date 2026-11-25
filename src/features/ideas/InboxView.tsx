import { FolderInput, Inbox, Mic, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, EmptyState } from '../../components/ui'
import type { InboxView as Inbox_ } from '../../domain/ideasView'
import { deletePendingCapture, discardInboxNote, undoOrganization } from '../../store/ideaActions'
import { describeAiResult, queueOrganize } from '../../store/ideaAi'
import { currentProvider } from '../../ai/provider'
import { ui } from '../../store/ui'
import { shortDateTime, toastResult } from './ideaUi'

/** Caixa de entrada: o que ainda não tem lugar. Organizar é sempre escolha da pessoa (ou da IA, depois). */
export function InboxView({ inbox }: { inbox: Inbox_ }) {
  const provider = currentProvider()
  const [busy, setBusy] = useState<string | null>(null)
  const withAi = (captureId: string) => {
    setBusy(captureId)
    queueOrganize(captureId, provider)
      .then((r) => ui.toast(describeAiResult(r), { undo: () => { undoOrganization(r.logId) } }))
      .catch((e: unknown) => ui.toast(e instanceof Error ? e.message : 'A IA não respondeu.', { tone: 'warn' }))
      .finally(() => setBusy(null))
  }
  if (!inbox.count) {
    return <EmptyState icon={Inbox} title="Caixa de entrada vazia." text="Tudo o que você soltou já tem lugar." />
  }
  return (
    <div className="flex flex-col gap-3" data-testid="ideas-inbox">
      {inbox.pending.map((c) => (
        <article key={c.id} className="ledger-dashed flex flex-col gap-3 rounded-[20px] p-4" data-testid={`inbox-capture-${c.id}`}>
          <p className="text-[16px] leading-relaxed break-words whitespace-pre-wrap text-ink">{c.text}</p>
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            {c.source === 'VOZ' ? <Mic size={15} aria-hidden /> : null}
            <span className="font-data">{shortDateTime(c.createdAt)}</span> · Aguardando organizar
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {provider ? <Button variant="primary" icon={Sparkles} className="flex-1" busy={busy === c.id} disabled={!!busy && busy !== c.id} onClick={() => withAi(c.id)} data-testid="inbox-organize-ai">Organizar com IA</Button> : null}
            <Button variant={provider ? 'secondary' : 'primary'} icon={FolderInput} className="flex-1" onClick={() => ui.openSheet('organizeIdea', { captureId: c.id })} data-testid="inbox-organize">{provider ? 'Eu organizo' : 'Organizar'}</Button>
            <Button variant="quiet" icon={Trash2} onClick={() => toastResult(deletePendingCapture(c.id), 'Pensamento apagado')}>Apagar</Button>
          </div>
        </article>
      ))}
      {inbox.notes.map((n) => (
        <article key={n.id} className="ledger-dashed flex flex-col gap-3 rounded-[20px] p-4" data-testid={`inbox-note-${n.id}`}>
          <p className="text-[16px] leading-relaxed break-words whitespace-pre-wrap text-ink">{n.text}</p>
          {n.inboxReason ? <p className="text-[13px] text-muted">Por que está aqui: {n.inboxReason}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" icon={FolderInput} className="flex-1" onClick={() => ui.openSheet('organizeIdea', { noteId: n.id })}>Organizar</Button>
            <Button variant="quiet" icon={Trash2} onClick={() => toastResult(discardInboxNote(n.id), 'Trecho tirado da Caixa de entrada')}>Tirar</Button>
          </div>
        </article>
      ))}
    </div>
  )
}
