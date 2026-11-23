import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_AI_MODEL, aiChoice, currentProvider, localProvider, setAiChoice } from './provider'

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe('IA local (ADR-0010)', () => {
  it('manda o contrato no formato do LM Studio com esquema obrigatório e devolve o JSON', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fake = ((url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return ok({ model: 'qwen/qwen3.5-9b', choices: [{ message: { content: '{"versao":"x"}' } }] })
    }) as unknown as typeof fetch
    const p = localProvider('https://pc.exemplo.ts.net', fake)!
    const r = await p.runStructured({ system: 'regras', schema: { type: 'object' }, input: 'pensamento' })
    expect(r).toEqual({ json: { versao: 'x' }, provider: 'ia-local', model: 'qwen/qwen3.5-9b' })
    expect(calls[0]!.url).toBe('https://pc.exemplo.ts.net/v1/chat/completions')
    expect(calls[0]!.body).toMatchObject({
      model: LOCAL_AI_MODEL,
      messages: [{ role: 'system', content: 'regras' }, { role: 'user', content: 'pensamento' }],
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: { type: 'object' } } },
    })
  })

  it('resposta que não é JSON vira null (o validador manda para a Caixa de entrada)', async () => {
    const fake = (() => ok({ choices: [{ message: { content: 'não sei' } }] })) as unknown as typeof fetch
    expect((await localProvider('https://pc', fake)!.runStructured({ system: '', schema: {}, input: '' })).json).toBeNull()
  })

  it('PC desligado ou erro do servidor viram mensagens claras', async () => {
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    await expect(localProvider('https://pc', down)!.runStructured({ system: '', schema: {}, input: '' })).rejects.toThrow('O PC está ligado e o Tailscale conectado')
    const err = (() => Promise.resolve(new Response('x', { status: 404 }))) as unknown as typeof fetch
    await expect(localProvider('https://pc', err)!.runStructured({ system: '', schema: {}, input: '' })).rejects.toThrow('O modelo está carregado no PC?')
  })

  it('sem endereço não existe provedor local', () => {
    expect(localProvider('')).toBeNull()
  })
})

describe('escolha da IA no aparelho', () => {
  // o Vitest roda em node: simula a janela e o armazenamento do navegador
  const store = new Map<string, string>()
  beforeEach(() => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() })
  })
  afterEach(() => {
    store.clear()
    vi.unstubAllGlobals()
  })

  it('guarda a escolha; valor estranho volta ao automático', () => {
    expect(aiChoice()).toBe('auto')
    setAiChoice('off')
    expect(aiChoice()).toBe('off')
    localStorage.setItem('ampara:ai', 'outra')
    expect(aiChoice()).toBe('auto')
  })

  it('sem IA local configurada: automático usa o Claude do app do PC; desligada não usa nada', () => {
    expect(currentProvider('auto')).toBeNull()
    ;(window as { amparaDesktop?: unknown }).amparaDesktop = { version: 't', status: vi.fn(), runStructured: vi.fn() }
    expect(currentProvider('auto')?.id).toBe('claude-assinatura')
    expect(currentProvider('claude')?.id).toBe('claude-assinatura')
    expect(currentProvider('off')).toBeNull()
  })
})
