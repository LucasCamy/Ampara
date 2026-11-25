/**
 * Barra do PC (ADR-0013, revisão de 2026-11-25): o Ampara fica escondido e atende a barra por trás. A barra é o único
 * campo; a resposta aparece embaixo dela, na mesma peça. Quem grava (cofre) e chama a IA continua sendo o app:
 * a barra só recebe texto para mostrar.
 */
import { useEffect } from 'react'
import { currentProvider, desktopBridge, type BarAction, type BarView } from '../../ai/provider'
import { CONVERSATION_LIMITS } from '../../domain/ideas'
import { extractConversation, myConversations, SendError, sendMessage } from '../../store/conversationActions'
import { dataStore } from '../../store/data'
import { captureThought, scheduleFromProposal, undoOrganization } from '../../store/ideaActions'
import { describeAiResult, guessPlace, proposeSchedule, queueOrganize, type ScheduleOffer } from '../../store/ideaAi'
import { longDateLabel, toDateKey } from '../../domain/dates'
import { parseWhen } from '../../domain/whenParse'
import { useUi } from '../../store/ui'

/** "qui., 26 de nov. · 18:00 às 19:00" ou "até sex., 27 de nov." */
export function whenLabel(o: ScheduleOffer): string {
  const p = o.proposal
  const day = longDateLabel(p.date)
  return p.kind === 'EVENT' && p.start ? `${day} · ${p.start} às ${p.end}` : `até ${day}`
}

export function proposalView(o: ScheduleOffer, busy = false): BarView {
  const p = o.proposal
  return {
    kind: 'proposal',
    busy,
    proposal: { kind: p.kind, title: p.title, when: whenLabel(o), location: p.location, notes: p.notes, source: o.sourceLabel, conflicts: o.conflicts },
  }
}

const when = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })

/** A conversa como a barra mostra: só texto, a última fala por último. */
export function chatView(conversationId: string, extra: Partial<BarView> = {}): BarView {
  const c = dataStore.get().ideaConversations[conversationId]
  if (!c) return { kind: 'clear' }
  return {
    kind: 'chat',
    conversationId,
    messages: c.messages.slice(-CONVERSATION_LIMITS.messages).map((m) => ({ role: m.role, text: m.text })),
    extracted: !!c.extractedCaptureId,
    ...extra,
  }
}

/** Guardar como ideia: grava na hora, palpite pelo sentido e organiza por trás. Cada passo atualiza a barra. */
async function release(text: string, show: (v: BarView) => void) {
  const captureId = captureThought(text)
  if (!captureId) return
  const provider = currentProvider()
  if (!provider) {
    show({ kind: 'saved', text: 'Guardado na Caixa de entrada. Organize quando quiser.' })
    return
  }
  show({ kind: 'saved', text: 'Guardado. A IA organiza por trás.' })
  void guessPlace(text).then((place) => { if (place) show({ kind: 'saved', text: `Guardado. Parece ser de ${place}.` }) })
  try {
    const r = await queueOrganize(captureId, provider)
    show({ kind: 'saved', text: describeAiResult(r), undo: r.logId })
  } catch (e) {
    show({ kind: 'saved', text: `${e instanceof Error ? e.message : 'A IA não respondeu.'} Está guardado, e eu organizo quando a IA voltar.` })
  }
}

/** Liga a barra ao app aberto (cofre destravado). Desmonta ao bloquear: a barra volta a pedir o login. */
export function useBarBridge() {
  const viewer = useUi((s) => s.viewer)
  useEffect(() => {
    const bridge = desktopBridge()
    if (!bridge?.onBarSubmit || !bridge.takeBarSubmit || !bridge.barView) return
    const show = (v: BarView) => bridge.barView!(v)
    let conversationId: string | null = null
    let busy = false
    // marcar pela barra (ADR-0014): a proposta espera o clique em "Marcar" ou "Só guardar como ideia"
    let offer: { text: string; data: ScheduleOffer | null } | null = null
    let lastUndo: (() => void) | null = null

    const chat = async (text: string) => {
      if (busy) return
      busy = true
      const before = conversationId ? chatView(conversationId) : { kind: 'chat' as const, messages: [] }
      show({ ...before, kind: 'chat', messages: [...(before.messages ?? []), { role: 'PESSOA', text }], busy: true })
      try {
        conversationId = await sendMessage(conversationId, text)
        show(chatView(conversationId))
      } catch (e) {
        const message = e instanceof Error ? e.message : 'A IA não respondeu.'
        if (e instanceof SendError) {
          conversationId = e.conversationId
          show(chatView(conversationId, { error: message }))
        } else show({ kind: 'saved', text: message })
      } finally {
        busy = false
      }
    }

    const propose = async (text: string) => {
      const mine = { text, data: null as ScheduleOffer | null }
      offer = mine
      show({ kind: 'proposal', busy: true, text: 'Vendo o que você já sabe sobre isso…' })
      const data = await proposeSchedule(text, toDateKey(new Date())).catch(() => null)
      if (offer !== mine) return
      if (!data) {
        offer = null
        await release(text, show)
        return
      }
      mine.data = data
      show(proposalView(data))
    }

    const take = async () => {
      const p = await bridge.takeBarSubmit!()
      if (!p) return
      if (p.mode === 'chat') await chat(p.text)
      else if (parseWhen(p.text, toDateKey(new Date()))) await propose(p.text)
      else await release(p.text, show)
    }

    const act = (a: BarAction) => {
      if (a.type === 'new') {
        conversationId = null
        show({ kind: 'clear' })
      } else if (a.type === 'list') {
        const items = myConversations(dataStore.get(), viewer).slice(0, 20).map((c) => ({ id: c.id, title: c.title || 'Conversa', when: when(c.updatedAt) }))
        show({ kind: 'list', items })
      } else if (a.type === 'open' && a.id) {
        const c = dataStore.get().ideaConversations[a.id]
        if (!c || c.ownerId !== viewer) return
        conversationId = a.id
        show(chatView(a.id))
      } else if (a.type === 'extract' && conversationId) {
        try {
          const { captureId } = extractConversation(conversationId)
          const id = conversationId
          show(chatView(id, { note: 'Enviada para as Ideias. A IA organiza por trás.' }))
          const provider = currentProvider()
          if (provider) {
            void queueOrganize(captureId, provider)
              .then((r) => { if (conversationId === id) show(chatView(id, { note: describeAiResult(r), undo: r.logId })) })
              .catch(() => { if (conversationId === id) show(chatView(id, { note: 'Está nas Ideias, e eu organizo quando a IA voltar.' })) })
          }
        } catch (e) {
          show(chatView(conversationId, { error: e instanceof Error ? e.message : 'Não consegui extrair.' }))
        }
      } else if (a.type === 'confirm' && offer?.data) {
        const o = offer.data
        offer = null
        const r = scheduleFromProposal(o.proposal)
        if (!r.ok) {
          show({ kind: 'saved', text: r.error })
          return
        }
        lastUndo = r.undo
        show({ kind: 'saved', text: `${o.proposal.kind === 'EVENT' ? 'Marcado na agenda' : 'Tarefa criada'}: ${o.proposal.title} · ${whenLabel(o)}.`, undo: 'marcar' })
      } else if (a.type === 'keep' && offer) {
        const text = offer.text
        offer = null
        void release(text, show)
      } else if (a.type === 'undo' && a.id === 'marcar') {
        lastUndo?.()
        lastUndo = null
        show({ kind: 'saved', text: 'Desfeito. Nada ficou na agenda.' })
      } else if (a.type === 'undo' && a.id) {
        if (undoOrganization(a.id)) show({ kind: 'saved', text: 'Desfeito. O pensamento voltou para a Caixa de entrada.' })
      }
    }

    bridge.setBarReady?.(true)
    void take()
    const offSubmit = bridge.onBarSubmit(() => void take())
    const offAction = bridge.onBarAction?.(act)
    return () => {
      offSubmit()
      offAction?.()
      bridge.setBarReady?.(false)
    }
  }, [viewer])
}
