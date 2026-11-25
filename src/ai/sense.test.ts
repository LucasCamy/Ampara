import { describe, expect, it, vi } from 'vitest'
import { forgetSense, localEmbed, senseScores, vectorsOf } from './sense'

// vetor falso: cada palavra-chave é um eixo
const AXES = ['planta', 'corrida', 'dinheiro']
const fakeEmbed = vi.fn(async (texts: string[]) => texts.map((t) => AXES.map((a) => (t.includes(a) ? 1 : 0.05))))

describe('sentido (ADR-0012)', () => {
  it('textos do mesmo assunto ficam perto; outros ficam longe', async () => {
    forgetSense()
    const r = await senseScores('a planta secou', [{ id: 'rega', text: 'regar a planta' }, { id: 'run', text: 'corrida leve' }], { embed: fakeEmbed, ready: async () => true })
    expect(r!.get('rega')!).toBeGreaterThan(0.9)
    expect(r!.get('run')!).toBeLessThan(0.2)
  })

  it('cada texto é calculado uma vez só (memória)', async () => {
    forgetSense()
    fakeEmbed.mockClear()
    await vectorsOf(['planta', 'corrida'], 'doc', fakeEmbed)
    await vectorsOf(['planta', 'corrida', 'dinheiro'], 'doc', fakeEmbed)
    expect(fakeEmbed.mock.calls.map((c) => c[0].length)).toEqual([2, 1])
    // pergunta e documento são guardados separados (prefixos diferentes)
    await vectorsOf(['planta'], 'query', fakeEmbed)
    expect(fakeEmbed).toHaveBeenCalledTimes(3)
    expect(fakeEmbed.mock.calls[2]![0][0]).toBe('task: search result | query: planta')
  })

  it('sem IA local ou fora do ar: null (o app usa só as palavras)', async () => {
    expect(await senseScores('x', [{ id: 'a', text: 'y' }], { embed: null })).toBeNull()
    expect(await senseScores('x', [{ id: 'a', text: 'y' }], { embed: fakeEmbed, ready: async () => false })).toBeNull()
    expect(await senseScores('x', [{ id: 'a', text: 'y' }], { embed: async () => null, ready: async () => true })).toBeNull()
  })

  it('chama o LM Studio com o modelo de sentido e confere a resposta', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] })))
    const embed = localEmbed('https://pc.exemplo', fetchMock as unknown as typeof fetch)!
    expect(await embed(['oi'])).toEqual([[1, 0]])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://pc.exemplo/v1/embeddings')
    expect(JSON.parse(init.body as string)).toEqual({ model: 'ampara-sentido', input: ['oi'] })
    // quantidade errada de vetores não vale
    const short = localEmbed('https://pc.exemplo', (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch)!
    expect(await short(['oi'])).toBeNull()
    expect(localEmbed('')).toBeNull()
  })
})
