import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { buildEmpty } from '../domain/seed'
import { purgeUnauthorized } from '../domain/merge'

vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: vi.fn() } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { deleteConversation, extractConversation, myConversations, SendError, sendMessage } = await import('./conversationActions')

const iso = '2026-11-23T10:00:00.000Z'
const state = () => dataStore.get()
const fake = (reply: unknown): AiProvider => ({ id: 'teste', label: 'Teste', runStructured: vi.fn(async () => ({ json: reply, provider: 'teste', model: 'm' })) })

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  dataStore.set(() => buildEmpty(new Date(iso), 'COUPLE'))
})

describe('conversas da barra', () => {
  it('guarda a fala e a resposta, e reabre pela lista', async () => {
    const id = await sendMessage(null, 'preciso organizar a mudança', fake({ resposta: 'Qual é o primeiro cômodo?' }))
    const conv = state().ideaConversations[id]!
    expect(conv.messages).toEqual([{ role: 'PESSOA', text: 'preciso organizar a mudança' }, { role: 'IA', text: 'Qual é o primeiro cômodo?' }])
    expect(conv).toMatchObject({ ownerId: 'A', extractedCaptureId: null })
    expect(conv.title).toBe('Preciso organizar a mudança')
    const id2 = await sendMessage(id, 'a cozinha', fake({ resposta: 'Comece pela gaveta de talheres.' }))
    expect(id2).toBe(id)
    expect(myConversations(state(), 'A')[0]!.messages).toHaveLength(4)
    expect(state().outbox.some((e) => e.entityType === 'ideaConversations' && e.entityId === id)).toBe(true)
  })

  it('se a IA falha, a fala já está guardada e o erro leva o id da conversa', async () => {
    const broken: AiProvider = { id: 'x', label: 'x', runStructured: async () => { throw new Error('Sem conexão com a internet.') } }
    const err = await sendMessage(null, 'oi tudo bem', broken).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SendError)
    const conv = state().ideaConversations[(err as InstanceType<typeof SendError>).conversationId]!
    expect(conv.messages).toEqual([{ role: 'PESSOA', text: 'oi tudo bem' }])
    expect((err as Error).message).toMatch(/guardada/)
    const bad = await sendMessage(null, 'outra', fake({ errado: true })).catch((e: unknown) => e)
    expect(bad).toBeInstanceOf(SendError)
    const none = await sendMessage(null, 'sem ia', null).catch((e: unknown) => e)
    expect(none).toBeInstanceOf(SendError)
  })

  it('extrair vira uma captura pendente com a transcrição e marca a conversa', async () => {
    const id = await sendMessage(null, 'decidi vender a bicicleta', fake({ resposta: 'Quer anunciar ainda hoje?' }))
    const { captureId, text } = extractConversation(id)
    expect(text).toBe('Eu: decidi vender a bicicleta Ampara: Quer anunciar ainda hoje?')
    expect(state().ideaCaptures[captureId]).toMatchObject({ text, status: 'PENDENTE', ownerId: 'A' })
    expect(state().ideaConversations[id]!.extractedCaptureId).toBe(captureId)
    expect(() => extractConversation('nao-existe')).toThrow(/não existe/)
  })

  it('apagar tem Desfazer e as ideias extraídas ficam', async () => {
    const id = await sendMessage(null, 'ideia solta', fake({ resposta: 'Certo.' }))
    const { captureId } = extractConversation(id)
    const undo = deleteConversation(id)!
    expect(state().ideaConversations[id]).toBeUndefined()
    expect(state().ideaCaptures[captureId]).toBeDefined()
    undo()
    expect(state().ideaConversations[id]!.messages).toHaveLength(2)
  })

  it('é privada de quem conversou: o par não lê, não extrai e não apaga', async () => {
    const id = await sendMessage(null, 'segredo meu', fake({ resposta: 'Ok.' }))
    uiStore.set((s) => ({ ...s, viewer: 'B' }))
    expect(myConversations(state(), 'B')).toEqual([])
    expect(() => extractConversation(id)).toThrow()
    expect(deleteConversation(id)).toBeNull()
    await expect(sendMessage(id, 'invadindo', fake({ resposta: 'x' }))).rejects.toThrow(/não existe/)
    // e o aparelho do par nunca guarda a conversa (privacidade no domínio, ADR-0009)
    expect(Object.keys(purgeUnauthorized(state(), 'B').ideaConversations)).toEqual([])
    expect(Object.keys(purgeUnauthorized(state(), 'A').ideaConversations)).toEqual([id])
  })
})
